# syntax=docker/dockerfile:1.7
###############################################################################
# Streamy frontend (Next.js 14)  —  multi-stage, workspace-aware
#
# Build context is the REPO ROOT (./streamy-app) — npm workspaces monorepo.
# Targets:
#   - development : `next dev` hot reload                 (docker-compose.yml)
#   - production  : standalone Next.js server, non-root   (docker-compose.prod.yml)
#
# NOTE: Production hosting for Streamy is Vercel, which builds Next natively and
# does NOT use this Dockerfile. This production stage exists so the self-hosted
# `docker compose -f docker-compose.yml -f docker-compose.prod.yml` path also works.
###############################################################################

ARG NODE_VERSION=22

FROM node:${NODE_VERSION}-slim AS base
WORKDIR /app
ENV NODE_ENV=development

###############################################################################
# deps — install the full workspace (cached on manifest changes only).
###############################################################################
FROM base AS deps
COPY package.json package-lock.json ./
COPY server/package.json ./server/package.json
COPY web/package.json ./web/package.json
RUN --mount=type=cache,target=/root/.npm \
    npm ci --workspaces --include-workspace-root

###############################################################################
# development — docker-compose.yml target. Source bind-mounted at run time;
# node_modules + .next come from anonymous volumes (see compose).
###############################################################################
FROM deps AS development
ENV NODE_ENV=development \
    WATCHPACK_POLLING=true \
    CHOKIDAR_USEPOLLING=true
COPY web ./web
# Pre-create the exact paths that compose mounts as anonymous volumes, owned by
# `node`. A fresh anonymous volume is initialized from the image's contents AND
# ownership at its mount point; if the directory does NOT exist in the image,
# Docker creates the volume mount point as root and the non-root `node` user
# gets EACCES writing to .next. Creating + chowning them here is what makes the
# anonymous-volume pattern work with a non-root user.
RUN mkdir -p /app/web/.next /app/web/node_modules /app/node_modules \
 && chown -R node:node /app
USER node
EXPOSE 3000
CMD ["npm", "run", "dev", "-w", "streamy-web"]

###############################################################################
# build — produce the standalone production bundle.
# NEXT_PUBLIC_* values are inlined at build time, so pass them as build args.
# NEXT_OUTPUT_STANDALONE flips next.config.js to `output: 'standalone'`.
###############################################################################
FROM deps AS build
ARG NEXT_PUBLIC_API_BASE=http://localhost:4000
ENV NEXT_PUBLIC_API_BASE=${NEXT_PUBLIC_API_BASE} \
    NEXT_OUTPUT_STANDALONE=true \
    NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1
COPY web ./web
RUN npm run build -w streamy-web

###############################################################################
# production — minimal standalone runtime. Non-root. No npm, no source.
# Next's standalone output bundles its own pruned node_modules + server.js.
###############################################################################
FROM base AS production
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000
WORKDIR /app
# The standalone server (monorepo layout puts the entry at web/server.js).
COPY --from=build /app/web/.next/standalone ./
# Static assets are not included in standalone and must be copied alongside it.
COPY --from=build /app/web/.next/static ./web/.next/static
USER node
EXPOSE 3000
CMD ["node", "web/server.js"]
