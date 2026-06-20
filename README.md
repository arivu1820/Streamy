# Streamy — Developer Guide (Local Setup)

Streamy is a private shared video platform for friend groups: create rooms, upload
videos, invite friends by email, watch in perfectly synced sessions, and chat — with
**no room owners** (group-affecting actions are decided democratically). Built from
the spec in [`../streamy.md`](../streamy.md).

This repository is the **easy-run demo build**: the same architecture as the spec, with
zero-setup substitutions so it runs locally with no Docker and no API keys.

| Spec (production) | This build |
|---|---|
| Google Sign-In (OIDC) | Dev login (Google still works if you set `GOOGLE_CLIENT_ID`) |
| PostgreSQL | SQLite via Prisma |
| Redis + Socket.IO Redis adapter | Single-node Socket.IO (in-memory live state) |
| Cloudflare R2 + HLS transcode | Local-disk storage + direct browser playback |
| Email worker (Resend/Postmark) | Invite accept-links shown in the app + logged to the API console |

---

## 1. Prerequisites

- **Node.js 18.18+** (Node 20 or 22 recommended) — check with `node -v`
- **npm 9+** (ships with Node) — check with `npm -v`
- A modern browser (Chrome, Edge, Firefox, or Safari)

No database server, Docker, or cloud account is required.

---

## 2. Quick start

This is an **npm workspaces** monorepo, so a single install at the root sets up both
apps. Run these three commands from the `streamy-app/` folder:

```bash
npm install      # installs the server + web workspaces
npm run setup    # generates the Prisma client, creates the SQLite DB, seeds demo users
npm run dev      # starts the API (:4000) and the web app (:3000) together
```

Open **http://localhost:3000**.

You should see the API log:

```
[streamy] API + realtime listening on http://localhost:4000
[seed] Demo users ready: alice@demo.test | bob@demo.test | carol@demo.test
```

> **Tip:** to test multi-user features (sync, voting, presence), open a second browser
> profile (or an incognito window) and sign in as a different demo user. localStorage is
> per-profile, so each window is a separate logged-in user.

---

## 3. Available scripts

Run from `streamy-app/` (the repo root):

| Command | What it does |
|---|---|
| `npm install` | Installs all dependencies for both workspaces |
| `npm run setup` | `prisma generate` + `prisma db push` (create schema) + seed demo data |
| `npm run dev` | Runs API and web concurrently (color-tagged `api` / `web`) |
| `npm run dev:api` | Runs only the API (`http://localhost:4000`) |
| `npm run dev:web` | Runs only the web app (`http://localhost:3000`) |
| `npm test` | Runs the server's Jest tests (vote-rule suite) |
| `npm run build` | Type-checks/builds both the server (`tsc`) and the web app (`next build`) |

Server-only scripts (run inside `server/`, or with `-w streamy-server`):

| Command | What it does |
|---|---|
| `npm run dev -w streamy-server` | Start API with hot reload (ts-node-dev) |
| `npm run setup -w streamy-server` | Regenerate Prisma client + reset/seed the DB |
| `npm test -w streamy-server` | Jest: exhaustive strict-majority vote-rule tests |

---

## 4. Configuration (environment variables)

### `server/.env`

```bash
DATABASE_URL="file:./streamy.db"      # SQLite file (created by `npm run setup`)
JWT_SECRET="dev-streamy-secret-change-in-prod"
PORT=4000
WEB_ORIGIN="http://localhost:3000"    # CORS + socket origin (comma-separate for multiple)
UPLOAD_DIR="./storage"                # where uploaded videos are written locally
GOOGLE_CLIENT_ID=""                   # optional: set to enable real Google Sign-In
```

### `web/.env.local`

```bash
NEXT_PUBLIC_API_BASE=http://localhost:4000   # base URL the browser uses to reach the API

# Optional: a TURN relay for voice chat on hard NATs/firewalls. Free for the common
# case without it (mesh P2P + Google STUN). Add a free TURN (e.g. Open Relay) to improve
# connectivity. Leave blank to use STUN-only.
# NEXT_PUBLIC_TURN_URL=turn:your-turn-host:3478
# NEXT_PUBLIC_TURN_USERNAME=...
# NEXT_PUBLIC_TURN_CREDENTIAL=...
```

If you change the API port, update both `server/.env` `PORT` and `web/.env.local`.

---

## 5. Project structure

```
streamy-app/
├─ package.json            # workspaces root: setup/dev/test/build scripts
├─ server/                 # NestJS API + Socket.IO gateway
│  ├─ prisma/
│  │  ├─ schema.prisma     # data model (SQLite); faithful to streamy.md §19
│  │  └─ seed.ts           # demo users + a shared "Movie Night" room
│  └─ src/
│     ├─ main.ts           # bootstrap, CORS, global validation, /api/v1 prefix
│     ├─ app.module.ts     # wires modules + global AuthGuard
│     ├─ shared.module.ts  # @Global singletons (Prisma, live-state, presence, JWT)
│     ├─ common/
│     │  ├─ governance.ts   # PURE strict-majority rules (unit-tested)
│     │  ├─ auth.guard.ts   # JWT guard + @Public + @CurrentUser + socket verify
│     │  ├─ membership.service.ts
│     │  └─ username.ts
│     ├─ auth/              # dev login + Google-ready token issue
│     ├─ users/             # profile, unique username, avatar
│     ├─ rooms/             # ownerless rooms, membership, leave/archival
│     ├─ invitations/       # invite by email, accept/decline/revoke
│     ├─ videos/            # upload (local disk), range streaming, delete-vote service
│     ├─ sessions/          # watch-session REST lifecycle
│     └─ realtime/          # Socket.IO gateway: playback governance, chat, presence
│        ├─ realtime.gateway.ts
│        ├─ session-state.service.ts   # authoritative live state (Redis in prod)
│        ├─ presence.service.ts
│        └─ realtime.service.ts        # broadcast helper for non-gateway services
└─ web/                    # Next.js (App Router) + Tailwind + socket.io-client
   ├─ app/
   │  ├─ login/            # dev login screen
   │  ├─ rooms/            # room list + room detail (Library/Sessions/Members/Chat)
   │  ├─ sessions/[id]/    # Theater: synced player + governance UI
   │  └─ invite/[token]/   # invitation accept page
   ├─ components/          # TopBar, ChatPanel, shared UI atoms
   └─ lib/                 # api client, socket client, auth context
```

---

## 6. Where each feature lives

| Feature | Backend | Frontend |
|---|---|---|
| Auth (dev + Google-ready) | `auth/auth.module.ts` | `app/login`, `lib/auth.tsx` |
| Ownerless rooms + leave/archival | `rooms/rooms.module.ts` | `app/rooms` |
| Invite by email + accept | `invitations/invitations.module.ts` | `app/invite/[token]`, Members tab |
| Upload + playback (≤10 GB) | `videos/videos.module.ts` | Library tab |
| **Strict-majority delete vote** | `videos/delete-vote.service.ts` + `common/governance.ts` | Library tab |
| Watch sessions + late-join sync | `sessions/`, `realtime/realtime.gateway.ts` | `app/sessions/[id]` |
| Playback governance (pause/host/seek/change-vote/transfer) | `realtime/realtime.gateway.ts` | Theater controls |
| Permanent chat (send/edit/delete) | `realtime/realtime.gateway.ts` | `components/ChatPanel.tsx` |
| Online presence | `realtime/presence.service.ts` | Members tab + Theater |
| **Voice chat (mesh WebRTC)** | `realtime/realtime.gateway.ts` (`voice.*` signaling relay) | `lib/useVoice.ts`, `components/VoiceBar.tsx` |

---

## 7. Five-minute feature tour

1. **Sign in** at http://localhost:3000 — click a seeded account (e.g. `alice@demo.test`).
   Open a second browser profile and sign in as `bob@demo.test`.
2. Both share the seeded **“Movie Night”** room. Open it.
3. **Library → Upload video** — pick any browser-playable file (MP4/WebM play directly).
4. Click **Watch** to start a session. In the other browser, open the room →
   **Sessions → Join**. The late joiner snaps to the current timestamp.
5. **Governance:** anyone can **Pause**; only the **host** can **Play/Seek**; a non-host
   uses **Request** and the host approves. **Change movie** triggers a group vote
   (majority passes, a tie keeps). Use **make host** to transfer control.
6. **Delete vote:** in Library, vote **Delete** from each account — the video is removed
   only when delete votes exceed half the members (a tie keeps it).
7. **Invite:** Members → invite an email. The accept-link appears in-app and in the API
   console. Open it to join.
8. **Chat** is permanent and shared between the room and the theater.
9. **Voice:** in the theater, click **Join voice** (allow the mic prompt). Do the same
   in the other browser — you'll hear each other. Audio is peer-to-peer; use **Mute**
   to toggle your mic. Voice works on `localhost`; in production it requires **HTTPS**.

---

## 8. API & realtime quick reference

REST base: `http://localhost:4000/api/v1` (send `Authorization: Bearer <token>`).

```
POST /auth/dev-login            { email }              -> { accessToken, user }
GET  /me
POST /rooms                     { name }
GET  /rooms                     (your rooms)
POST /rooms/:id/invitations     { email }              -> { acceptUrl }
POST /invitations/:token/accept
POST /rooms/:id/videos          (multipart: file)      -> upload
GET  /rooms/:id/videos                                 -> list + vote tally
PUT  /videos/:id/delete-vote    { value: delete|keep }
POST /rooms/:id/sessions        { videoId }            -> start watch session
GET  /rooms/:id/messages?limit=50                      -> chat history
```

Socket.IO namespace: `ws://localhost:4000/rt` (auth `{ token }` on connect).
Key client→server events: `session.join`, `playback.pause` (anyone),
`playback.play`/`playback.seek` (host), `playback.request` + `.approve`,
`playback.change.request` + `.vote`, `host.transfer.offer`/`.accept`,
`chat.message.send`/`.edit`/`.delete`, `presence.heartbeat`.

---

## 9. Testing

```bash
npm test                       # from root (runs the server suite)
# or
npm test -w streamy-server
```

`server/test/governance.spec.ts` exhaustively verifies the strict-majority rule
(`deleteVotes > floor(members/2)`, tie keeps) for 1–30 members, plus the spec's
worked examples (11 members/6 delete → delete; 10 members/5-5 → keep).

---

## 10. Troubleshooting

**`'next' / 'ts-node-dev' is not recognized` or `EPERM` during install (Windows).**
A previous install failed partway and left a broken `node_modules`. Clean reinstall:

```powershell
# PowerShell, from streamy-app/
Remove-Item -Recurse -Force node_modules, server\node_modules, web\node_modules -ErrorAction SilentlyContinue
Remove-Item -Force package-lock.json -ErrorAction SilentlyContinue
npm install
npm run setup
npm run dev
```

If `EPERM` persists, a program is holding the folder open — close editors/terminals
pointed at `node_modules`, and if this folder is OneDrive-synced, pause sync during install.

**`Environment variable not found: DATABASE_URL`.** Run from the right place: `npm run setup`
must run with `server/.env` present (it is by default). Re-run `npm run setup`.

**Port already in use (4000 or 3000).** Change `PORT` in `server/.env` (and
`NEXT_PUBLIC_API_BASE` in `web/.env.local`) or `next dev -p`.

**Video won't play.** Use a browser-playable file (MP4/H.264 or WebM). This demo serves
files directly without transcoding; MKV/AVI may not play in-browser (production adds an
HLS transcode step — see §11).

**The `multer` / `glob` / `inflight` deprecation warnings** during install are harmless
transitive-dependency notices, not errors.

**Reset all data.** Stop the app, delete `server/prisma/streamy.db` and the
`server/storage/` folder, then run `npm run setup` again.

---

## 11. Moving toward production

- **Auth:** set `GOOGLE_CLIENT_ID` and wire the web login button to Google Identity
  Services; `POST /auth/google` already verifies ID tokens.
- **Database:** change the Prisma datasource to `postgresql` and use migrations.
- **Realtime scale:** add `@socket.io/redis-adapter` and move session/presence state
  from the in-memory services to Redis.
- **Storage:** replace local disk with Cloudflare R2 (S3 multipart upload + presigned
  URLs) and an FFmpeg → HLS transcode worker.
- **Email:** add a queue-backed email worker (Resend/Postmark) where invites currently
  log to the console.

See `../streamy.md` for the full production architecture, schema, and roadmap.
