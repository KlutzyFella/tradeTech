# TradeTech: API + web app in one image (ADR 0004). Build from the repo root:
#   docker build -t tradetech .
# The server runs TypeScript via Node's type stripping, so workspace packages
# stay outside node_modules (pnpm symlink layout, not `pnpm deploy`).

FROM node:24-alpine AS base
WORKDIR /repo
RUN corepack enable
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY packages/engine/package.json packages/engine/
COPY packages/contracts/package.json packages/contracts/

FROM base AS web-build
RUN pnpm install --frozen-lockfile --filter @tradetech/web...
COPY packages packages
COPY apps/web apps/web
RUN pnpm --filter @tradetech/web exec vite build

FROM base AS server-build
RUN pnpm install --frozen-lockfile --filter @tradetech/server...
COPY apps/server/prisma apps/server/prisma
COPY apps/server/prisma.config.ts apps/server/
RUN pnpm --filter @tradetech/server db:generate

FROM base AS prod-deps
RUN pnpm install --frozen-lockfile --prod --filter @tradetech/server...

FROM node:24-alpine AS runtime
RUN apk add --no-cache openssl
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    WEB_DIST_DIR=/repo/apps/web/dist \
    RUN_MIGRATIONS=true
WORKDIR /repo
COPY --from=prod-deps --chown=node:node /repo ./
COPY --chown=node:node packages/engine/src packages/engine/src
COPY --chown=node:node packages/contracts/src packages/contracts/src
COPY --chown=node:node apps/server/src apps/server/src
COPY --chown=node:node apps/server/prisma apps/server/prisma
COPY --chown=node:node apps/server/prisma.config.ts apps/server/docker-entrypoint.sh apps/server/
COPY --from=server-build --chown=node:node /repo/apps/server/src/generated apps/server/src/generated
COPY --from=web-build --chown=node:node /repo/apps/web/dist apps/web/dist
USER node
WORKDIR /repo/apps/server
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s CMD wget -qO- "http://127.0.0.1:${PORT}/health" || exit 1
ENTRYPOINT ["./docker-entrypoint.sh"]
