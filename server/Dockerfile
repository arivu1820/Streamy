# syntax=docker/dockerfile:1.7
###############################################################################
# Streamy backend (NestJS + Prisma)  —  multi-stage, workspace-aware
#
# Build context is the REPO ROOT (./streamy-app) because this is an npm
# workspaces monorepo: the lockfile and hoisted node_modules live at the root.
# Targets:
#   - development : ts-node-dev hot reload, full dev deps        (docker-compose.yml)
#   - production  : compiled JS, pruned prod deps, non-root      (docker-compose.prod.yml)
###############################################################################

ARG NODE_VERSION=22

###############################################################################
# base — shared OS layer. Debian slim (not alpine) so Prisma's OpenSSL engine
# resolves cleanly. openssl is required by the Prisma query engine.
###############################################################################
FROM node:${NODE_VERSION}-slim AS base
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=development

###############################################################################
# deps — install the FULL workspace once. Copying only manifests first keeps
# this layer cached until a package.json / lockfile actually changes.
###############################################################################
FROM base AS deps
COPY package.json package-lock.json ./
COPY server/package.json ./server/package.json
COPY web/package.json ./web/package.json
# Prisma schema is needed for the postinstall/generate to resolve the client.
COPY server/prisma ./server/prisma
RUN --mount=type=cache,target=/root/.npm \
    npm ci --workspaces --include-workspace-root
# Generate the Prisma client into the hoisted node_modules/.prisma
RUN npx --workspace streamy-server prisma generate

###############################################################################
# development — what docker-compose.yml targets. Source is bind-mounted at run
# time; node_modules comes from this image via an anonymous volume (see compose).
###############################################################################
FROM deps AS development
ENV NODE_ENV=development \
    CHOKIDAR_USEPOLLING=true \
    CHOKIDAR_INTERVAL=400
# Copy source so the image is runnable on its own (CI, `docker run`) even
# without a bind mount. The compose bind mount overlays this in dev.
COPY server ./server
COPY tsconfig*.json ./
COPY docker/entrypoint.sh /usr/local/bin/streamy-entrypoint
RUN chmod +x /usr/local/bin/streamy-entrypoint \
 && mkdir -p /app/server/storage \
 && chown -R node:node /app
USER node
EXPOSE 4000
ENTRYPOINT ["streamy-entrypoint"]
CMD ["npm", "run", "dev", "-w", "streamy-server"]

###############################################################################
# build — compile TypeScript to dist/ for production.
###############################################################################
FROM deps AS build
COPY server ./server
COPY tsconfig*.json ./
RUN npm run build -w streamy-server

###############################################################################
# prod-deps — production-only node_modules (smaller runtime image).
###############################################################################
FROM base AS prod-deps
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY server/package.json ./server/package.json
COPY web/package.json ./web/package.json
COPY server/prisma ./server/prisma
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev --workspace streamy-server --include-workspace-root
RUN npx --workspace streamy-server prisma generate

###############################################################################
# production — slim runtime. Non-root. Compiled JS + prod deps only.
###############################################################################
FROM base AS production
ENV NODE_ENV=production \
    PORT=4000 \
    UPLOAD_DIR=/app/server/storage
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build     /app/server/dist  ./server/dist
COPY server/package.json ./server/package.json
COPY server/prisma       ./server/prisma
COPY package.json ./
COPY docker/entrypoint.sh /usr/local/bin/streamy-entrypoint
RUN chmod +x /usr/local/bin/streamy-entrypoint \
 && mkdir -p /app/server/storage \
 && chown -R node:node /app
USER node
EXPOSE 4000
ENTRYPOINT ["streamy-entrypoint"]
# In production we run migrations (migrate deploy) then the compiled server.
CMD ["node", "server/dist/main.js"]
