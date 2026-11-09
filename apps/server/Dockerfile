# Build context: repository root.  docker build -f apps/server/Dockerfile .
# The server runs TypeScript directly via Node's type stripping. Workspace
# packages must stay outside node_modules (Node refuses to strip types there),
# so the runtime keeps pnpm's workspace symlink layout instead of `pnpm deploy`.

FROM node:24-alpine AS base
WORKDIR /repo
RUN corepack enable
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY apps/server/package.json apps/server/
COPY packages/engine/package.json packages/engine/
COPY packages/contracts/package.json packages/contracts/

FROM base AS build
RUN pnpm install --frozen-lockfile --filter @tradetech/server...
COPY apps/server/prisma apps/server/prisma
COPY apps/server/prisma.config.ts apps/server/
RUN pnpm --filter @tradetech/server db:generate

FROM base AS prod-deps
RUN pnpm install --frozen-lockfile --prod --filter @tradetech/server...

FROM node:24-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /repo
COPY --from=prod-deps --chown=node:node /repo ./
COPY --chown=node:node packages/engine/src packages/engine/src
COPY --chown=node:node packages/contracts/src packages/contracts/src
COPY --chown=node:node apps/server/src apps/server/src
COPY --from=build --chown=node:node /repo/apps/server/src/generated apps/server/src/generated
USER node
WORKDIR /repo/apps/server
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s CMD wget -qO- http://127.0.0.1:3000/health || exit 1
CMD ["node", "src/server.ts"]
