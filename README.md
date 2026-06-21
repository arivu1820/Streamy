# Streamy

> A private, real-time co-watching platform for friend groups — create rooms, upload videos, and watch them in perfectly synchronized sessions with live chat and voice. There are **no room owners**: group-affecting actions (changing the video, deleting media) are decided democratically.

This README is the complete developer setup guide. If you have just cloned the repo, start at **[Prerequisites](#3-prerequisites)** and follow the sections in order — a junior developer should be able to get the whole stack running by copy-pasting the commands below.

---

## Table of contents

1. [Project overview](#1-project-overview)
2. [Tech stack](#2-tech-stack)
3. [Prerequisites](#3-prerequisites)
4. [Environment setup](#4-environment-setup)
5. [Docker development setup (recommended)](#5-docker-development-setup-recommended)
6. [Local development without Docker](#6-local-development-without-docker)
7. [Development workflow](#7-development-workflow)
8. [Database setup (Prisma)](#8-database-setup-prisma)
9. [Common errors & troubleshooting](#9-common-errors--troubleshooting)
10. [Useful commands reference](#10-useful-commands-reference)
11. [Folder structure](#11-folder-structure)
12. [Ports](#12-ports)
13. [Production notes](#13-production-notes)

---

## 1. Project overview

Streamy is a **full-stack, real-time web application**. Groups of friends create private rooms, upload videos, and watch them together — when one person pauses or seeks, everyone's player stays in sync. Rooms also have permanent chat, online presence, mesh WebRTC voice chat, and democratic controls (e.g. a strict-majority vote is required to delete a video or change what's playing).

### Architecture at a glance

The system is a **monorepo** (npm workspaces) split into a backend and a frontend, backed by a database and a cache, all orchestrated with Docker Compose:

```
                    Browser (http://localhost:3000)
                          │
            REST /api/v1  │  WebSocket /rt (Socket.IO + WebRTC signaling)
                          ▼
   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐
   │     web      │   │    server    │   │   postgres   │   │    redis     │
   │  Next.js 14  │──▶│  NestJS 10   │──▶│  PostgreSQL  │   │    cache     │
   │  (frontend)  │   │  (backend)   │   │  (database)  │   │  (realtime)  │
   └──────────────┘   └──────┬───────┘   └──────────────┘   └──────────────┘
                             │ Prisma ORM
```

| Layer | Service | Responsibility |
|---|---|---|
| **Frontend** | `web` | Next.js UI, talks to the backend over REST + WebSocket |
| **Backend** | `server` | NestJS REST API, Socket.IO gateway, auth, WebRTC signaling relay |
| **Database** | `postgres` | Persistent data (users, rooms, videos, sessions, chat) via Prisma |
| **Cache / realtime** | `redis` | Present now; powers the Socket.IO adapter & shared realtime state as the app scales |

> **Note:** Redis is included from day one even though the single-node setup doesn't fully depend on it yet. This keeps the network topology and configuration stable so horizontal scaling later requires application code changes only — no infrastructure changes.

---

## 2. Tech stack

| Category | Technology |
|---|---|
| **Language** | TypeScript |
| **Frontend** | Next.js 14 (App Router), React 18, Tailwind CSS, `socket.io-client` |
| **Backend** | NestJS 10, Socket.IO 4, JWT auth, WebRTC signaling |
| **ORM** | Prisma 5 |
| **Database** | PostgreSQL 16 |
| **Cache / pub-sub** | Redis 7 |
| **Runtime** | Node.js 22 |
| **Package manager** | npm (workspaces / monorepo) |
| **Containerization** | Docker + Docker Compose |

---

## 3. Prerequisites

Install these **before** doing anything else. You only strictly need **Git** and **Docker Desktop** to run the project (Docker provides Node, PostgreSQL, and Redis inside containers). Node.js on your host is only required if you want to run the apps *without* Docker, or run Prisma commands from your machine.

| Tool | Recommended version | Why you need it | Download |
|---|---|---|---|
| **Git** | latest | Clone the repository | https://git-scm.com/downloads |
| **Docker Desktop** | latest | Runs the whole stack in containers | https://www.docker.com/products/docker-desktop/ |
| **Node.js** | **22 LTS** (18.18+ works) | Host-side dev & Prisma CLI (optional if you only use Docker) | https://nodejs.org/ |
| **npm** | 9+ (ships with Node) | Installs dependencies | (comes with Node.js) |

### Verify your installations

Run each command — you should see a version number, not an error:

```bash
git --version            # e.g. git version 2.45.0
docker --version         # e.g. Docker version 27.x
docker compose version   # e.g. Docker Compose version v2.29.x   (note: "compose" is a subcommand, no hyphen)
node -v                  # e.g. v22.x   (only needed for non-Docker dev)
npm -v                   # e.g. 10.x
```

### Platform notes

- **Windows:** Docker Desktop requires the **WSL 2** backend (the installer sets this up; enable virtualization in BIOS if prompted). Run the commands in **PowerShell** or **WSL**. If your project folder is synced by **OneDrive**, move it out (e.g. to `C:\dev\`) — OneDrive locks `node_modules` and breaks installs.
- **macOS:** Install Docker Desktop for your chip (Apple Silicon vs Intel). No extra steps.
- **Linux:** You can install Docker Engine + the Compose plugin directly instead of Docker Desktop. Make sure your user is in the `docker` group so you don't need `sudo` for every command.

> **Important:** Make sure Docker Desktop is **running** (the whale icon in your tray/menu bar is steady, not animating) before you run any `docker compose` command. "Cannot connect to the Docker daemon" almost always means Docker Desktop hasn't finished starting.

---

## 4. Environment setup

### 4.1 Clone the repository

```bash
git clone <your-repo-url>
cd streamy-app
```

> All commands in this guide are run from the `streamy-app/` folder (the repo root) unless stated otherwise.

### 4.2 Create your `.env` file

The repo ships a template called `.env.example`. Copy it to `.env`, which Docker Compose loads automatically:

```bash
# macOS / Linux
cp .env.example .env

# Windows (PowerShell)
Copy-Item .env.example .env
```

Open `.env` and adjust values if needed. **The defaults work out of the box for local development** — every variable also has a fallback baked into `docker-compose.yml`, so `docker compose up` works even without a `.env` file. You only *must* change values when deploying somewhere shared.

### 4.3 Environment variables explained

| Variable | Used by | Default | Purpose |
|---|---|---|---|
| `POSTGRES_USER` | `postgres`, `server` | `streamy` | Database username |
| `POSTGRES_PASSWORD` | `postgres`, `server` | `streamy` | Database password — **change outside local dev** |
| `POSTGRES_DB` | `postgres`, `server` | `streamy` | Database name |
| `POSTGRES_PORT` | host | `5432` | Host port for connecting GUIs/`psql` |
| `REDIS_PORT` | host | `6379` | Host port for `redis-cli` |
| `JWT_SECRET` | `server` | `dev-streamy-...` | Signs auth tokens — **must change in production** |
| `WEB_ORIGIN` | `server` | `http://localhost:3000` | CORS allow-list for REST + WebSocket |
| `GOOGLE_CLIENT_ID` | `server` | *(blank)* | Optional real Google Sign-In; blank = dev login only |
| `NEXT_PUBLIC_API_BASE` | `web` (browser) | `http://localhost:4000` | URL the browser uses to reach the API |

> **How `DATABASE_URL` works:** You don't set it by hand for Docker. `docker-compose.yml` builds it from the `POSTGRES_*` values and points the backend at the `postgres` **service name** (`postgresql://…@postgres:5432/…`). Inside the Docker network, services find each other by name — never `localhost`. The `server/.env` file contains a `localhost` variant used only when you run the backend directly on your host (see [Section 6](#6-local-development-without-docker)).

---

## 5. Docker development setup (recommended)

This is the easiest and most reliable way to run Streamy: one command brings up the frontend, backend, PostgreSQL, and Redis together, already wired to each other. **You do not need Node.js installed on your host for this path.**

### 5.1 What containers run

| Container | Image / build | Port (host → container) | Purpose |
|---|---|---|---|
| `web` | built from `web/Dockerfile` | `3000 → 3000` | Next.js dev server (hot reload) |
| `server` | built from `server/Dockerfile` | `4000 → 4000` | NestJS API + Socket.IO (hot reload) |
| `postgres` | `postgres:16-alpine` | `5432 → 5432` | Database |
| `redis` | `redis:7-alpine` | `6379 → 6379` | Cache / realtime |

### 5.2 First run

```bash
# 1. Start the database and cache first
docker compose up -d postgres redis

# 2. Create the initial database schema (one-time).
#    This runs the Prisma migration against PostgreSQL.
#    Requires Node.js on your host — see Section 8 for a Docker-only alternative.
cd server && npm install && npm run db:migrate -- --name init && cd ..

# 3. Start the whole stack
docker compose up --build
```

Then open **http://localhost:3000**. You should see the backend log:

```
[streamy] API + realtime listening on http://localhost:4000
```

> **Don't have Node.js on your host?** You can run the migration *inside* the backend container instead. See [Section 8.2](#82-running-prisma-inside-docker).

### 5.3 Everyday Docker commands

| Command | What it does | When to use |
|---|---|---|
| `docker compose up` | Start all services, stream logs to your terminal | Normal day-to-day work |
| `docker compose up -d` | Start in the background (detached) | When you want your terminal back |
| `docker compose up --build` | Rebuild images first, then start | After changing a `Dockerfile`, `package.json`, or the lockfile |
| `docker compose ps` | List running containers and their status | Check what's up / healthy |
| `docker compose logs -f server` | Follow logs for one service (`-f` = live tail) | Debugging a specific service |
| `docker compose restart web` | Restart a single service | After a config tweak that needs a fresh process |
| `docker compose stop` | Stop containers but keep them and their data | Pause work for the day |
| `docker compose down` | Stop and remove containers + network (**keeps named volumes/data**) | Clean shutdown |
| `docker compose down -v` | Same as above **plus deletes all volumes** | ⚠️ Full reset — **destroys your database and uploads** |

> **Hot reload is automatic.** Your source code is bind-mounted into the containers, so editing files on your host instantly reloads the running app. You only need `--build` when dependencies or the Dockerfile change — **not** for ordinary code edits.

### 5.4 Rebuilding and resetting

```bash
# Rebuild a single service after a dependency change
docker compose up -d --build server

# Recreate a service with FRESH anonymous volumes (fixes .next / node_modules
# permission or corruption issues) WITHOUT touching the database:
docker compose up -d --build --renew-anon-volumes web

# Nuclear option: tear everything down and wipe ALL data (DB + uploads + cache)
docker compose down -v
```

---

## 6. Local development without Docker

You can run the Node apps directly on your host while still using the **Dockerized PostgreSQL and Redis** (the simplest hybrid). This gives the fastest possible hot reload and easy debugging.

### 6.1 Start the databases in Docker

```bash
docker compose up -d postgres redis
```

The `server/.env` file is preconfigured to reach these at `localhost:5432` / `localhost:6379`.

### 6.2 Install dependencies (monorepo / npm workspaces)

This is an **npm workspaces** monorepo, so a **single install at the root** sets up both the `server` and `web` workspaces. Run it from `streamy-app/`:

```bash
npm install
```

> **Why one install?** Workspaces hoist shared dependencies into a single root `node_modules`, which avoids duplication and version conflicts between the frontend and backend.

### 6.3 Set up the database (Prisma)

```bash
cd server
npm run prisma:generate     # generate the typed Prisma client
npm run db:migrate -- --name init   # create + apply the initial migration
npm run db:seed             # optional: load demo users + a sample room
cd ..
```

### 6.4 Start the apps

```bash
# Both apps together (color-tagged "api" / "web")
npm run dev

# …or each one separately, in its own terminal:
npm run dev:api    # backend  → http://localhost:4000
npm run dev:web    # frontend → http://localhost:3000
```

### 6.5 Common npm issues (and fixes)

| Symptom | Cause | Fix |
|---|---|---|
| **Deprecation warnings** (e.g. `multer`, `glob`, `inflight`) during install | Harmless notices from transitive sub-dependencies | Ignore them — they are **warnings, not errors**, and don't affect the build |
| **Peer dependency warnings** | A package prefers a different version of a shared dep | Usually safe to ignore in dev. If install actually fails, try `npm install --legacy-peer-deps` |
| **`'next'` / `'ts-node-dev' is not recognized`** or `EPERM` on Windows | A previous install failed partway and left a broken `node_modules` | Clean reinstall (see below) |
| **`npm install` fails or hangs** | Corrupted npm cache | `npm cache clean --force`, then reinstall |
| **`node_modules` corruption** | Interrupted install, OneDrive sync, or editor locking files | Delete and reinstall (see below); pause OneDrive during install |

**Clean reinstall (the universal npm fix):**

```bash
# macOS / Linux
rm -rf node_modules server/node_modules web/node_modules package-lock.json
npm cache clean --force
npm install
```

```powershell
# Windows (PowerShell), from streamy-app/
Remove-Item -Recurse -Force node_modules, server\node_modules, web\node_modules -ErrorAction SilentlyContinue
Remove-Item -Force package-lock.json -ErrorAction SilentlyContinue
npm cache clean --force
npm install
```

> If `EPERM` persists on Windows, a program is holding the folder open. Close any editor/terminal pointed at `node_modules`, and pause OneDrive sync if the folder is synced.

---

## 7. Development workflow

### When to use which setup

| Use **Docker** (`docker compose up`) when… | Use **`npm run dev`** (host) when… |
|---|---|
| You want a one-command, production-like environment | You want the fastest reload / easiest breakpoints |
| You don't want Node/Postgres/Redis installed on your host | You're iterating heavily on one app |
| Onboarding a new developer | You're debugging with host tooling |

Both paths talk to the **same Dockerized PostgreSQL and Redis**, so you can switch freely.

### How frontend and backend interact

- The **browser** loads the frontend from `http://localhost:3000` and calls the backend at `http://localhost:4000` (the value of `NEXT_PUBLIC_API_BASE`).
- REST requests go to `http://localhost:4000/api/v1/...` with an `Authorization: Bearer <token>` header.
- Real-time features (playback sync, chat, presence, voice signaling) use a **Socket.IO** connection on the `/rt` namespace at `ws://localhost:4000/rt`.
- **CORS** is controlled by `WEB_ORIGIN` on the backend — it must include the frontend's origin (`http://localhost:3000` by default).

### Hot reload behavior

- **Backend:** `ts-node-dev` watches `server/src` and restarts on save.
- **Frontend:** Next.js Fast Refresh updates the browser on save.
- In Docker, file watching uses polling (`CHOKIDAR_USEPOLLING` / `WATCHPACK_POLLING`) so changes are detected reliably across the Docker Desktop boundary on Windows/macOS.

### Prisma workflow

Whenever you change `server/prisma/schema.prisma`:

```bash
cd server
npm run db:migrate -- --name <describe_your_change>   # create + apply a migration
npm run prisma:generate                               # refresh the typed client
```

Commit the generated folder under `server/prisma/migrations/` so teammates and production apply the same schema history.

---

## 8. Database setup (Prisma)

Streamy uses **Prisma** with **PostgreSQL**. Prisma generates a fully typed client from `schema.prisma` and manages schema changes through migrations.

### 8.1 Key commands (run inside `server/`)

| Command | What it does |
|---|---|
| `npm run prisma:generate` | Generate the typed Prisma client from the schema |
| `npm run db:migrate -- --name <name>` | Create a new migration and apply it (development) |
| `npm run db:deploy` | Apply existing committed migrations (production / CI) |
| `npm run db:studio` | Open **Prisma Studio**, a visual DB browser, at http://localhost:5555 |
| `npm run db:seed` | Run `prisma/seed.ts` to load demo data |
| `npm run db:push` | Push the schema without creating a migration (quick prototyping only) |

### 8.2 Running Prisma inside Docker

If you don't have Node.js on your host, run any Prisma command in the backend container:

```bash
docker compose exec server npm run db:migrate -- --name init
docker compose exec server npm run db:seed
docker compose exec server npm run db:studio   # then open http://localhost:5555
```

> The backend's `docker/entrypoint.sh` also applies migrations automatically on container start (`prisma migrate deploy` when migrations exist), so a freshly built stack converges to the correct schema on boot.

### 8.3 Resetting the database

```bash
# Drop, recreate, re-apply all migrations, and re-seed (development only):
docker compose exec server npx --workspace streamy-server prisma migrate reset

# …or wipe the entire data volume and start clean (also removes uploads + cache):
docker compose down -v && docker compose up -d
```

---

## 9. Common errors & troubleshooting

### 9.1 Port already in use (`EADDRINUSE`)

**Why it happens:** another process — often a previous `npm run dev`, a leftover Docker container, or an unrelated app — is already listening on `3000` (web) or `4000` (api). Two processes can't bind the same port.

**Find and free the port:**

```bash
# macOS / Linux — find the process on a port, then kill it
lsof -i :3000
kill -9 <PID>
```

```powershell
# Windows (PowerShell) — find the PID using the port, then kill it
netstat -ano | findstr :3000
taskkill /PID <PID> /F
```

**If a Docker container is holding the port,** stop the stack instead of killing processes:

```bash
docker compose ps        # see which container maps the port
docker compose down      # release the ports
```

> You can also change the host port: set `POSTGRES_PORT`/`REDIS_PORT` in `.env`, or change the published `3000`/`4000` mappings in `docker-compose.yml`. If you change the API port, also update `NEXT_PUBLIC_API_BASE`.

### 9.2 Prisma errors

| Error | Likely cause | Fix |
|---|---|---|
| `Environment variable not found: DATABASE_URL` | The backend ran without its env loaded | Ensure `.env` exists (Docker) or `server/.env` exists (host). Re-run after copying `.env.example`. |
| `Can't reach database server at postgres:5432` | Postgres isn't up yet, or you ran the backend on the host using the `postgres` hostname | Run `docker compose up -d postgres` and wait for healthy; on the host use the `localhost` URL in `server/.env`. |
| **`Foreign key constraint failed`** | Inserting/deleting rows in the wrong order, or seeding against a stale schema | Reset and re-migrate: `prisma migrate reset` (see [8.3](#83-resetting-the-database)). Ensure related parent rows exist first. |
| `Drift detected` / `migration ... failed` | Your DB schema no longer matches the migration history | In dev, `prisma migrate reset`. Never hand-edit applied migrations. |
| `@prisma/client did not initialize yet` / types missing | The client wasn't generated after a schema change | `npm run prisma:generate` (or rebuild the image so the build step regenerates it). |

### 9.3 Docker issues

| Symptom | Cause | Fix |
|---|---|---|
| **`Cannot connect to the Docker daemon`** | Docker Desktop isn't running | Start Docker Desktop; wait for the whale icon to settle, then retry. |
| **`postgres` / `redis` shows `unhealthy`** | Service didn't pass its healthcheck (often still starting, or a corrupt data volume) | Check `docker compose logs postgres`. If corrupt: `docker compose down -v` (⚠️ wipes data) then `up`. |
| **Backend exits before DB is ready** | Race on first boot | Healthchecks + `depends_on: service_healthy` handle this; if you hit it, just `docker compose up` again. |
| **`EACCES: permission denied, open '/app/web/.next/...'`** | The `.next` anonymous volume was created **root-owned** because the non-root `node` user can't write it | Recreate fresh anon volumes from the fixed image: `docker compose rm -fsv web && docker compose up -d --build --renew-anon-volumes web`. (The Dockerfile pre-creates `.next` owned by `node`; the old root-owned volume must be discarded.) |
| **Stale build / changes not picked up** | Docker reused a cached layer or old anonymous volume | `docker compose up -d --build --renew-anon-volumes <service>`. |
| **"No space left on device"** | Accumulated images/volumes | `docker system prune` and `docker volume prune` (review what they remove first). |
| **Code edits don't hot-reload in Docker** | File-watch events not crossing the host boundary | Already mitigated via polling envs; ensure you're editing the bind-mounted source, and on Windows keep the project on the Linux/WSL or a non-OneDrive path. |

### 9.4 npm issues

See the table and clean-reinstall steps in **[Section 6.5](#65-common-npm-issues-and-fixes)**. In short: deprecation/peer warnings are safe to ignore; for real failures, clear the cache and do a clean reinstall.

---

## 10. Useful commands reference

```bash
# ── Docker ───────────────────────────────────────────────────────────────
docker compose up                 # start everything (foreground)
docker compose up -d              # start everything (background)
docker compose up --build         # rebuild images, then start
docker compose ps                 # list services + status
docker compose logs -f server     # follow one service's logs
docker compose restart web        # restart a single service
docker compose down               # stop + remove containers (keeps data)
docker compose down -v            # stop + remove containers AND data volumes
docker compose exec server sh     # open a shell inside the backend container

# ── npm (run from repo root) ─────────────────────────────────────────────
npm install                       # install all workspace dependencies
npm run dev                       # run api + web together
npm run dev:api                   # backend only (:4000)
npm run dev:web                   # frontend only (:3000)
npm run build                     # type-check / build both apps
npm test                          # run backend test suite

# ── Prisma (run inside server/, or via `docker compose exec server`) ──────
npm run prisma:generate           # generate typed client
npm run db:migrate -- --name x    # create + apply a dev migration
npm run db:deploy                 # apply migrations (prod/CI)
npm run db:studio                 # open Prisma Studio (:5555)
npm run db:seed                   # seed demo data
```

---

## 11. Folder structure

```
streamy-app/
├─ docker-compose.yml         # dev stack: web, server, postgres, redis
├─ docker-compose.prod.yml    # production-aligned override
├─ .env.example               # copy → .env (Compose loads it automatically)
├─ .dockerignore              # keeps build context small (excludes node_modules, storage…)
├─ DOCKER_ARCHITECTURE.md     # deep-dive on the Docker/Postgres/Redis architecture
├─ docker/
│  └─ entrypoint.sh           # backend startup: wait-for-db → migrate → run
│
├─ server/                    # ── NestJS backend ──
│  ├─ Dockerfile              # multi-stage (development / production)
│  ├─ prisma/
│  │  ├─ schema.prisma        # data model (PostgreSQL)
│  │  ├─ migrations/          # committed migration history
│  │  └─ seed.ts              # demo users + sample room
│  └─ src/
│     ├─ main.ts              # bootstrap: CORS, validation, /api/v1 prefix
│     ├─ auth/                # dev login + Google-ready token issue
│     ├─ users/  rooms/       # profiles; ownerless rooms & membership
│     ├─ invitations/         # invite by email, accept/decline
│     ├─ videos/              # upload, range streaming, delete-vote
│     ├─ sessions/            # watch-session REST lifecycle
│     └─ realtime/            # Socket.IO gateway: sync, chat, presence, voice
│
└─ web/                       # ── Next.js frontend ──
   ├─ Dockerfile              # multi-stage (development / production)
   ├─ app/                    # App Router pages (login, rooms, sessions, invite)
   ├─ components/             # TopBar, ChatPanel, VoiceBar, shared UI
   └─ lib/                    # api client, socket client, auth context
```

For a full breakdown of the infrastructure decisions, see **[`DOCKER_ARCHITECTURE.md`](./DOCKER_ARCHITECTURE.md)**.

---

## 12. Ports

| Service | URL / Port | Notes |
|---|---|---|
| **Frontend (web)** | http://localhost:3000 | Next.js dev server |
| **Backend API (server)** | http://localhost:4000 | REST base: `/api/v1` |
| **WebSocket (realtime)** | ws://localhost:4000/rt | Socket.IO namespace |
| **PostgreSQL** | localhost:5432 | For `psql` / GUI tools (TablePlus, DBeaver…) |
| **Redis** | localhost:6379 | For `redis-cli` |
| **Prisma Studio** | http://localhost:5555 | Only while `db:studio` is running |

---

## 13. Production notes

The local Docker setup is intentionally a faithful, small-scale model of the production target. A few things change for real deployments:

- **Production builds:** the Dockerfiles include a `production` stage that compiles the backend (`tsc` → `dist`) and builds the frontend as a slim **Next.js standalone** server. Run the stack with the production override:
  ```bash
  docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
  ```
  In production the entrypoint applies migrations with `prisma migrate deploy` (never `migrate dev`), and database/cache ports are **not** published publicly.
- **Environment & security:** never commit a real `.env`. Set a strong `JWT_SECRET`, use managed PostgreSQL/Redis credentials, and restrict `WEB_ORIGIN` to your real domain. Secrets are injected at runtime, not baked into images.
- **Scaling path:** move uploads to object storage (Cloudflare R2), enable the **Socket.IO Redis adapter** so multiple backend instances share realtime state, and put an nginx/TLS reverse proxy in front (remember to forward WebSocket `Upgrade` headers for Socket.IO and WebRTC signaling).

See **[`DOCKER_ARCHITECTURE.md`](./DOCKER_ARCHITECTURE.md)** for the full production roadmap, volume/networking deep-dive, and scaling stages.

---

**Happy hacking!** If something here is unclear or out of date, please open an issue or PR so the next developer has an even smoother setup.

---

## Redis: local development & production

Streamy uses Redis as the **Socket.IO adapter** so realtime broadcasts (chat, presence, playback sync) fan out reliably. It is wired in `server/src/realtime/redis-io.adapter.ts` and activated in `server/src/main.ts`.

### How it behaves
- **Local (Docker):** `REDIS_URL=redis://redis:6379` (the bundled `redis` service). Set automatically by `docker-compose.yml`.
- **Local (host-direct):** `REDIS_URL=redis://localhost:6379` against the Dockerized Redis.
- **Production:** set `REDIS_URL` to your **Upstash** TLS endpoint, e.g. `rediss://default:PASSWORD@host.upstash.io:6379`. TLS is auto-detected from the `rediss://` scheme.
- **Missing / unreachable Redis:** the app **does not crash** — it logs a warning and falls back to the in-memory adapter (correct for a single instance). This keeps the dev workflow frictionless.

The adapter adds connection **retry/backoff** and **startup logging**:
```
[RedisIoAdapter] Redis pub client ready.
[RedisIoAdapter] Connected to Redis (rediss://***:***@...) — Socket.IO is using the Redis adapter.
```
or, with no Redis:
```
[Bootstrap] REDIS_URL not set — Socket.IO using the in-memory adapter (single instance only).
```

### Setup steps
1. **Local:** nothing to do — `docker compose up` starts Redis and sets `REDIS_URL`.
2. **Production:** create a database at [upstash.com](https://upstash.com) → copy the `rediss://` URL → set it as `REDIS_URL` on Render.

> Note: the Redis adapter fans out Socket.IO **broadcasts**. The authoritative live-session state (`SessionStateService`/`PresenceService`) is still in-process, so production runs as a **single** instance. See `DEPLOYMENT.md` §1 for the full rationale.

## Deploying to the cloud (free tiers)

Full step-by-step instructions for **Vercel + Render + Neon + Upstash + Cloudflare R2** are in **[`DEPLOYMENT.md`](./DEPLOYMENT.md)**, including environment-variable tables, WebSocket/CORS setup, Prisma migration workflow, a production checklist, and troubleshooting.
