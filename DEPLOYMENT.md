# Streamy — Production Deployment Guide

Deploy Streamy to **free** cloud tiers:

| Piece | Service | Free tier | Why |
|---|---|---|---|
| Frontend (Next.js) | **Vercel** | Yes | First-party Next.js host, global CDN, auto HTTPS |
| Backend API + Socket.IO (NestJS) | **Render** | Yes | Runs Docker, supports WebSockets, injects `$PORT` |
| PostgreSQL | **Neon** | Yes | Serverless Postgres + connection pooler |
| Redis | **Upstash** | Yes | Serverless Redis over TLS (`rediss://`) |
| Video storage | **Cloudflare R2** | Yes (10 GB) | S3-compatible, **zero egress fees** |
| Source control / CI trigger | **GitHub** | Yes | Vercel + Render auto-deploy on push |

> This guide is specific to **your** repo (`streamy-app`, an npm-workspaces monorepo with `server/` NestJS + `web/` Next.js). Every change referenced here has already been applied to your files. Section 1 explains what changed and why.

---

## 0. The single most important thing to understand

Your app has **three kinds of state**, and on free tiers each must live in a *managed* service, not inside the Render container:

1. **Relational data** (users, rooms, videos, chat) → Neon, not the Dockerized Postgres.
2. **Uploaded video files** → Cloudflare R2, **not the container disk**. Render's free filesystem is **ephemeral**: every deploy and every 15‑minute idle spin‑down wipes it. Your original code wrote uploads to `server/storage` on local disk — those files would vanish. This is now fixed (see §1 and §6).
3. **Realtime fan‑out** (Socket.IO broadcasts) → Upstash Redis adapter, so broadcasts survive restarts and could span instances.

---

## 1. What was wrong, and what changed (project-specific analysis)

### Deployment blockers found
| # | Issue | Risk | Fix applied |
|---|---|---|---|
| 1 | Uploads + streaming used **local disk** (`UPLOAD_DIR=/app/server/storage`) | Videos lost on every Render redeploy/spin‑down | New `StorageService` with `local`/`r2` drivers; R2 in prod (`server/src/storage/storage.service.ts`) |
| 2 | **Redis provisioned but unused** — `REDIS_URL` was set, but Socket.IO ran the in‑memory adapter | Broadcasts can't cross instances/restarts | `RedisIoAdapter` wired in `main.ts` (`server/src/realtime/redis-io.adapter.ts`) |
| 3 | **No health endpoint** | Render health checks have nothing to hit | `GET /api/v1/health` (`server/src/health/health.module.ts`) |
| 4 | Prisma had only `url` (pooled) | `prisma migrate deploy` **breaks** over a PgBouncer pooler | Added `directUrl` to `schema.prisma`; `DIRECT_URL` wired through compose/entrypoint/Render |
| 5 | `.gitignore` did **not** ignore `.env` | Secrets committed to git (they were — `.env`, `server/.env`, `web/.env.local` are tracked) | `.gitignore` rewritten; **you must untrack + rotate** (see §9) |
| 6 | `web/Dockerfile` had **no `production` stage** | `docker-compose.prod.yml`'s `target: production` for web fails to build | Completed the Dockerfile + gated `output:'standalone'` |
| 7 | `next.config.js` forced `output:'standalone'` always | Can confuse Vercel builds | Now gated behind `NEXT_OUTPUT_STANDALONE` (set only in Docker) |
| 8 | Socket client used `transports:['websocket']` only | First connect can fail during Render cold start | Added `polling` fallback + reconnection in `web/lib/socket.ts` |
| 9 | No startup env validation | Confusing late runtime crashes | `validateEnv()` fails fast in prod, warns in dev |

### Production risks to accept on free tiers (documented, not bugs)
- **Render free spins down after ~15 min idle** → next request cold-starts (~30–60 s) and **active WebSockets drop**. The client now auto-reconnects. For a "movie night" app this means the first person in wakes the server.
- **Live session state is still in-process.** `SessionStateService` / `PresenceService` hold the authoritative play/pause/seek state in memory `Map`s. The Redis adapter fans out *broadcasts*, but this state is **not** in Redis, so it resets if the single instance restarts mid-session, and you must stay at **1 instance**. Moving that state into Redis is a larger refactor — fine to defer for a friends-only app.
- **R2 staging.** Uploads are staged to the container's temp disk, then pushed to R2. A genuine 10 GB upload can exceed Render's small ephemeral disk; realistic friend-group clips are fine. True streaming multipart upload is a future enhancement.
- **WebRTC voice** uses free Google STUN. Peers behind strict/symmetric NATs may fail to connect without a TURN server (optional `NEXT_PUBLIC_TURN_*`).

---

## 2. Deploy order (do it in this sequence)

```
Neon (DB)  →  Upstash (Redis)  →  Cloudflare R2 (storage)
          →  Render (backend, needs the 3 above)
          →  Vercel (frontend, needs the Render URL)
          →  Go back and set WEB_ORIGIN on Render = the Vercel URL
```
The last step matters: the backend can't know its frontend's URL until Vercel gives you one.

---

## 3. Neon PostgreSQL

1. Create a project at neon.tech → it gives you a database (default `neondb`; you can name it `streamy`).
2. In **Connection Details**, copy **two** connection strings:
   - **Pooled** — host contains `-pooler` (e.g. `ep-cool-name-pooler.us-east-2.aws.neon.tech`). This is your **`DATABASE_URL`** (runtime).
   - **Direct** — the same host **without** `-pooler`. This is your **`DIRECT_URL`** (migrations).
3. Ensure both end with `?sslmode=require`.

```
DATABASE_URL=postgresql://USER:PASS@ep-xxxx-pooler.us-east-2.aws.neon.tech/streamy?sslmode=require
DIRECT_URL=postgresql://USER:PASS@ep-xxxx.us-east-2.aws.neon.tech/streamy?sslmode=require
```

### Why two URLs (this is the #4 fix)
Prisma's **migration engine cannot run through a transaction-mode pooler** (PgBouncer). Your schema now declares:
```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")  // pooled — used by the running app
  directUrl = env("DIRECT_URL")    // direct — used by `prisma migrate deploy`
}
```
Your container entrypoint runs `prisma migrate deploy` on boot. With `directUrl` set, migrations use the direct connection automatically; the app's normal queries use the pooled one.

### Commands explained
- `prisma generate` — builds the typed client from `schema.prisma`. Runs **at image build time** (it's in `server/Dockerfile`). No DB needed.
- `prisma migrate deploy` — applies committed migrations in `server/prisma/migrations/` to the database. Runs **at container boot** (entrypoint). Idempotent and safe to run on every deploy. Your repo already has the `20260621170019_init` migration.
- **Never** run `prisma migrate dev` or `db push --accept-data-loss` against production — those can drop data.

First deploy applies `init` automatically. To seed demo users once: `npm run db:seed -w streamy-server` with `DATABASE_URL`/`DIRECT_URL` pointed at Neon (run locally).

---

## 4. Upstash Redis

1. Create a database at upstash.com → **Redis** → pick a region near your Render region.
2. Copy the **`rediss://`** URL (TLS). It looks like:
   ```
   REDIS_URL=rediss://default:PASSWORD@apt-xxxx-12345.upstash.io:6379
   ```
3. That's the only variable. The backend auto-detects TLS from the `rediss://` scheme.

### How Streamy uses it
`server/src/realtime/redis-io.adapter.ts` opens two ioredis connections (pub + sub) and installs `@socket.io/redis-adapter`. On boot you'll see:
```
[RedisIoAdapter] Redis pub client ready.
[RedisIoAdapter] Connected to Redis (rediss://***:***@...) — Socket.IO is using the Redis adapter.
```
If `REDIS_URL` is absent or Redis is unreachable, the app **does not crash** — it logs a warning and uses the in-memory adapter (correct for a single instance). This keeps local `docker compose up` working unchanged (it uses the local `redis` service at `redis://redis:6379`).

---

## 5. Cloudflare R2 (video storage)

1. Cloudflare dashboard → **R2** → **Create bucket** → name it `streamy-videos`.
2. **R2 → Manage R2 API Tokens → Create API token** (Object Read & Write). Copy:
   - Access Key ID → `R2_ACCESS_KEY_ID`
   - Secret Access Key → `R2_SECRET_ACCESS_KEY`
3. Your **Account ID** (R2 overview page) → `R2_ACCOUNT_ID`.
4. Set `R2_BUCKET=streamy-videos` and `STORAGE_DRIVER=r2`.

```
STORAGE_DRIVER=r2
R2_ACCOUNT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
R2_ACCESS_KEY_ID=xxxxxxxxxxxxxxxxxxxx
R2_SECRET_ACCESS_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
R2_BUCKET=streamy-videos
# R2_PUBLIC_BASE_URL=        # optional: set only if you make the bucket public / add a CDN domain
```

### How streaming works now (and why it's right for free tier)
`GET /api/v1/videos/:id/stream?token=…` no longer pipes bytes through Render. It:
1. verifies the JWT and room membership, then
2. **302-redirects** the browser to a **short-lived presigned R2 URL** (default 1 h).

The browser then does HTTP range requests **directly against R2**. R2 has **no egress fees**, so video traffic never touches Render's CPU/RAM/bandwidth — essential on a 512 MB free instance. Keep the bucket **private**; presigned URLs grant temporary access. Only set `R2_PUBLIC_BASE_URL` if you intentionally make objects public behind a CDN.

---

## 6. Render (backend API + Socket.IO)

You have a **`render.yaml`** Blueprint at the repo root. Two ways to deploy:

### Option A — Blueprint (recommended)
1. Push to GitHub (see §9).
2. Render → **New +** → **Blueprint** → select your repo. Render reads `render.yaml`.
3. It will prompt for the `sync:false` secrets — paste the values from §3–§5. `JWT_SECRET` is auto-generated.
4. Leave `WEB_ORIGIN` blank for now (you'll fill it after Vercel). Deploy.

### Option B — Manual
New **Web Service** → connect repo → **Runtime: Docker** → **Dockerfile path: `server/Dockerfile`** → **Docker build context: `.`** (repo root — required for the workspace) → **Health check path: `/api/v1/health`** → add the env vars below.

### Render env vars
| Var | Value |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | Neon **pooled** URL |
| `DIRECT_URL` | Neon **direct** URL |
| `JWT_SECRET` | strong random (Render can generate) |
| `WEB_ORIGIN` | your Vercel URL, e.g. `https://streamy.vercel.app` |
| `REDIS_URL` | Upstash `rediss://…` |
| `STORAGE_DRIVER` | `r2` |
| `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET` | from §5 |
| `GOOGLE_CLIENT_ID` | optional (blank = dev login only) |

**Do not set `PORT`.** Render injects it; the app now binds `0.0.0.0:$PORT` (fix in `main.ts`). `EXPOSE 4000` in the Dockerfile is only documentation.

### PORT, CORS, health, WebSockets — what makes this work
- **PORT**: `await app.listen(Number(process.env.PORT) || 4000, '0.0.0.0')`. Binding `0.0.0.0` lets Render's router reach the container.
- **CORS**: `WEB_ORIGIN` (comma-separated) drives both REST CORS (`main.ts`) and the Socket.IO gateway CORS (`@WebSocketGateway` in `realtime.gateway.ts`). Both are credentialed.
- **Health**: `/api/v1/health` returns `{status, db, redis, storage, uptime}` and pings the DB.
- **WebSockets**: Render supports them natively — no extra config. Your gateway namespace is `/rt`; the client connects to `wss://<render-url>/rt`.

---

## 7. Vercel (frontend)

1. Vercel → **Add New… → Project** → import your GitHub repo.
2. **Root Directory: leave as the repo root** (do **not** set it to `web`). Your `vercel.json` handles the workspace:
   ```json
   {
     "framework": "nextjs",
     "installCommand": "npm ci",
     "buildCommand": "npm run build --workspace streamy-web",
     "outputDirectory": "web/.next"
   }
   ```
   This installs the whole npm workspace from the root lockfile, then builds only `web`.
3. **Environment Variables** (Production):
   ```
   NEXT_PUBLIC_API_BASE=https://streamy-api.onrender.com   # your Render URL, no trailing slash
   ```
   `NEXT_PUBLIC_*` are **inlined at build time** and shipped to the browser. Changing one requires a **redeploy**, not just a restart. Never put secrets in `NEXT_PUBLIC_*`.
4. Deploy. Vercel gives you `https://<project>.vercel.app` and automatic HTTPS.
5. **Go back to Render** and set `WEB_ORIGIN` to this exact URL, then redeploy the backend (CORS).

### How the frontend finds the backend
`web/lib/api.ts` derives everything from one variable:
```
API_BASE = NEXT_PUBLIC_API_BASE + '/api/v1'   // REST
ORIGIN   = NEXT_PUBLIC_API_BASE               // Socket.IO connects to ORIGIN + '/rt'
```
So one correct value wires REST, WebSocket, and the video stream URL. Because it's `https://`, the socket upgrades to `wss://` automatically.

### Redeploying
Push to your production branch → Vercel and Render both auto-build. Or use each dashboard's **Redeploy** button. On Vercel, change an env var → **Redeploy** to re-inline it.

---

## 8. WebSockets / Socket.IO in production — checklist
- ✅ Render supports WS natively (no toggle).
- ✅ Client uses `transports:['websocket','polling']` + auto-reconnect (`web/lib/socket.ts`) so a cold start recovers.
- ✅ Gateway CORS = `WEB_ORIGIN`; must equal the Vercel origin exactly (scheme + host, no trailing slash).
- ✅ Auth token is passed in the Socket.IO handshake (`auth.token`), verified in `handleConnection`.
- ✅ Redis adapter installed so broadcasts (`room:*`, `session:*`) fan out across restarts/instances.
- ⚠️ Stay at **1 Render instance** (live session Maps are in-process). Don't enable autoscaling.

---

## 9. GitHub workflow & secrets

### One-time: stop tracking the secrets already in your repo
These are currently committed (verified): `.env`, `server/.env`, `web/.env.local`, `server/prisma/streamy.db`. Run in your terminal (PowerShell/Git Bash) from `streamy-app/`:
```bash
git rm --cached .env server/.env web/.env.local server/prisma/streamy.db
git rm --cached "server/src/realtime/realtime.gateway.ts.bak" \
                "server/src/realtime/session-state.service.ts.bak" \
                "web/components/VoiceBar.tsx.bak"
git add .gitignore
git commit -m "chore: stop tracking env/secret/db/bak files; production deploy config"
```
> If git complains about `.git/index.lock`, delete that file first (`del .git\index.lock` on Windows) — a previous process left it behind.

**Rotate the leaked secrets** (they live in git history): generate a new `JWT_SECRET` and change the Postgres password. Anything ever committed should be treated as compromised.

### Branch & deploy strategy
- `main` → production. Vercel + Render auto-deploy on push to `main`.
- Feature branches → Vercel builds **Preview** deployments automatically (great for testing). Point Render at `main` only.
- Never commit real `.env*` files — only the `*.example` files are tracked.

### .gitignore (now correct)
Ignores `.env`, `.env.*` (keeping `*.example`), `*.db/.sqlite`, `server/storage/`, `*.bak`, build output.

---

## 10. Production readiness checklist

**Database**
- [ ] Neon project created; `DATABASE_URL` (pooled) + `DIRECT_URL` (direct), both `?sslmode=require`
- [ ] `prisma migrate deploy` ran on first boot (check Render logs for "applying migrations")
- [ ] (optional) seeded demo users

**Redis**
- [ ] Upstash `rediss://` URL set; logs show "Socket.IO is using the Redis adapter"

**Storage**
- [ ] R2 bucket created (private); `STORAGE_DRIVER=r2` + all `R2_*` set
- [ ] Test upload appears in the R2 bucket; playback works (network tab shows a 302 to `*.r2.cloudflarestorage.com`)

**Backend (Render)**
- [ ] Docker build context = repo root; Dockerfile = `server/Dockerfile`
- [ ] `/api/v1/health` returns `{"status":"ok","db":"up"}`
- [ ] `PORT` **not** set manually; `WEB_ORIGIN` = Vercel URL
- [ ] `JWT_SECRET` strong & rotated

**Frontend (Vercel)**
- [ ] Root Directory = repo root; `vercel.json` present
- [ ] `NEXT_PUBLIC_API_BASE` = Render URL (https, no trailing slash)
- [ ] Build succeeds; site loads over HTTPS

**Realtime**
- [ ] Chat message from user A appears for user B
- [ ] Play/pause/seek syncs in a watch session
- [ ] Socket reconnects after waking a cold backend

**Security / SSL**
- [ ] HTTPS on both Vercel and Render (automatic)
- [ ] No `.env*` (except examples) tracked in git; secrets rotated
- [ ] R2 bucket not public (unless intentionally behind a CDN)

---

## 11. Troubleshooting

**CORS error in browser console**
`WEB_ORIGIN` on Render must equal the frontend origin **exactly** — `https://streamy.vercel.app`, no trailing slash, no path. Multiple origins: comma-separate. Redeploy the backend after changing it (the value is read at boot).

**WebSocket won't connect / keeps polling**
1. `NEXT_PUBLIC_API_BASE` must be `https://` (so the socket uses `wss://`). 2. `WEB_ORIGIN` must include the Vercel origin (gateway CORS). 3. First attempt after idle may fail while Render cold-starts — the client retries automatically; reload after ~30–60 s. 4. Confirm the client targets `…/rt` (it does, via `ORIGIN + '/rt'`).

**Prisma `migrate deploy` fails**
- *"prepared statement ... already exists" / pooler errors*: `DIRECT_URL` is missing or also points at the `-pooler` host. It must be the **non-pooler** Neon host.
- *Can't reach database*: missing `?sslmode=require`, or wrong password.
- *"No migration found"*: ensure `server/prisma/migrations/` is committed (it is).

**Docker build fails on Render**
- *Build context error / can't find `package-lock.json`*: build context must be the **repo root** (`.`), not `server/`. The Dockerfile copies root manifests for the workspace.
- *Prisma engine download*: the build needs network (Render has it). The `debian-openssl-3.0.x` binary target in `schema.prisma` matches Render's Debian image — keep it.

**Render deploy succeeds but app crashes on boot**
Check logs for the `[Env]` validation block — it lists exactly which variable is missing (e.g. `STORAGE_DRIVER=r2 but missing: R2_BUCKET`). Fix and redeploy.

**Vercel build fails**
- *"Module not found" / workspace deps*: ensure Root Directory is the **repo root** and `vercel.json` is present (installs from the root lockfile).
- *`output: standalone` weirdness*: it's now gated behind `NEXT_OUTPUT_STANDALONE`, which Vercel never sets — so Vercel uses its native output. Don't set that variable on Vercel.

**Env var mistakes (most common)**
- `NEXT_PUBLIC_API_BASE` with a trailing slash → double-slash URLs. Remove it.
- Setting `PORT` on Render → may not match Render's router. Leave it unset.
- Putting a secret in a `NEXT_PUBLIC_*` var → it ships to the browser. Never do this.

**`EADDRINUSE` / PORT issues**
- Locally: something already holds 3000/4000. Find it: `lsof -i :4000` (mac/Linux) / `netstat -ano | findstr :4000` (Windows), then kill it, or change `POSTGRES_PORT`/ports in `.env`.
- On Render: don't hardcode `PORT`; the app must use `process.env.PORT` (it does).

**Videos upload but won't play**
- 302 not happening → `STORAGE_DRIVER` isn't `r2`, or R2 creds wrong (check `/api/v1/health` → `"storage":"r2"`).
- Plays then 403 after a while → presigned URL expired mid-watch; raise `R2_URL_TTL_SECONDS`.
- Uploads vanish after redeploy → you're still on `local` storage; switch to `r2`.

**Voice chat connects but no audio for some users**
Symmetric NAT — add a TURN server via `NEXT_PUBLIC_TURN_URL/_USERNAME/_CREDENTIAL` on Vercel.

---

## 12. Local development still works (unchanged)
```bash
cp .env.example .env          # optional; compose has safe defaults
docker compose up --build     # web :3000, api :4000, postgres, redis
```
Local uses the bundled Postgres/Redis and `STORAGE_DRIVER=local` (disk). None of the production wiring affects the dev workflow — Redis falls back gracefully, `DIRECT_URL` defaults to `DATABASE_URL`, and storage stays on disk.
