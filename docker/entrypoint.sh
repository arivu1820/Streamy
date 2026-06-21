#!/usr/bin/env sh
###############################################################################
# Streamy backend entrypoint.
#
# Responsibilities (in order):
#   1. Wait for PostgreSQL to accept connections (compose healthchecks already
#      gate startup, but this makes `docker run` and slow first-boots safe too).
#   2. Apply the database schema:
#        - production  -> `prisma migrate deploy`  (apply committed migrations)
#        - development -> `prisma migrate deploy` if a migrations/ dir exists,
#                         otherwise fall back to `prisma db push` (preserves the
#                         original "easy-run" workflow until you create the first
#                         migration with `prisma migrate dev --name init`).
#   3. Hand off (exec) to the container CMD — keeping PID 1 signal handling.
#
# This script is intentionally idempotent and infra-agnostic: business logic
# lives in the app, not here.
###############################################################################
set -e

APP_DIR="${APP_DIR:-/app}"
cd "$APP_DIR"

# Prisma uses DIRECT_URL for `migrate deploy`. If the platform only provides a
# single DATABASE_URL (e.g. a simple setup), fall back to it so migrations run.
export DIRECT_URL="${DIRECT_URL:-$DATABASE_URL}"

PRISMA="npx --workspace streamy-server prisma"

# ---------------------------------------------------------------------------
# 1. Wait for Postgres. Parse host:port out of DATABASE_URL; default 5432.
# ---------------------------------------------------------------------------
db_host="$(printf '%s' "$DATABASE_URL" | sed -E 's#^.*://[^@]*@([^:/?]+).*$#\1#')"
db_port="$(printf '%s' "$DATABASE_URL" | sed -E 's#^.*://[^@]*@[^:/?]+:([0-9]+).*$#\1#')"
[ "$db_host" = "$DATABASE_URL" ] && db_host="postgres"
case "$db_port" in ''|*[!0-9]*) db_port=5432 ;; esac

echo "[streamy] waiting for postgres at ${db_host}:${db_port} ..."
i=0
until node -e "require('net').connect(${db_port}, '${db_host}').on('connect', ()=>process.exit(0)).on('error', ()=>process.exit(1))" 2>/dev/null; do
  i=$((i+1))
  if [ "$i" -ge 60 ]; then
    echo "[streamy] postgres not reachable after 60s — aborting." >&2
    exit 1
  fi
  sleep 1
done
echo "[streamy] postgres is up."

# ---------------------------------------------------------------------------
# 2. Schema. Generate is a no-op cost in dev (client already built in image).
# ---------------------------------------------------------------------------
if [ -d "$APP_DIR/server/prisma/migrations" ]; then
  echo "[streamy] applying migrations (prisma migrate deploy)..."
  $PRISMA migrate deploy
elif [ "$NODE_ENV" = "production" ]; then
  echo "[streamy] NODE_ENV=production but no migrations/ found." >&2
  echo "[streamy] Create one first: npm run db:migrate -- --name init" >&2
  exit 1
else
  echo "[streamy] no migrations/ dir — dev bootstrap via 'prisma db push'..."
  $PRISMA db push --skip-generate --accept-data-loss
fi

# ---------------------------------------------------------------------------
# 3. Hand off to CMD.
# ---------------------------------------------------------------------------
echo "[streamy] starting: $*"
exec "$@"
