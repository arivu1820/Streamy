# syntax=docker/dockerfile:1.7
###############################################################################
# Streamy frontend (Next.js 14)  —  multi-stage, workspace-aware
#
# Build context is the REPO ROOT (./streamy-app) — npm workspaces monorepo.
# Targets:
#   - development : `next dev` hot reload                 (docker-compose.yml)
#   - production  : standalone Next.js server, non-root   (docker-compose.prod.yml)
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
###############################################################################
FROM deps AS build
ARG NEXT_PUBLIC_API_BASE=http://localhost:4000
ENV NEXT_PUBLIC_API_BASE=${NEXT_PUBLIC_API_BASE} \
    NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1
COPY web ./web
RUN npm run build -w streamy-web

###############################################################################
# production — minimal runtime using Next.js standalone output.
###############################################################################
FROM base AS production
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000
# Standalone output bundles only the needed node_modules.
COPY --from=build /app/web/.next/standalone ./
COPY --from=build /app/web/.next/static     ./web/.next/static
COPY --from=build /app/web/public           ./web/public
USER node
EXPOSE 3000
CMD ["node", "web/server.js"]
