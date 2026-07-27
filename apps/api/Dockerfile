# syntax=docker/dockerfile:1.7
#
# @booking/api — NestJS. Multi-stage, mirroring the two frontend Dockerfiles.
#
# The same image runs BOTH the API and the migration job: `prisma` is a runtime
# dependency (not a devDependency) so `prisma migrate deploy` works from the
# deployed image. That keeps schema and code on exactly the same commit — a
# migration container built from a different tree is how environments drift.
ARG NODE_VERSION=22.22.0
ARG PNPM_VERSION=10.13.1
ARG TURBO_VERSION=2.10.4

FROM node:${NODE_VERSION}-alpine AS base
ARG PNPM_VERSION
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate
WORKDIR /app

FROM base AS pruner
ARG TURBO_VERSION
RUN pnpm add --global turbo@${TURBO_VERSION}
COPY . .
RUN turbo prune @booking/api --docker

FROM base AS builder
COPY --from=pruner /app/tsconfig.base.json ./tsconfig.base.json
COPY --from=pruner /app/out/json/ ./
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store pnpm install --frozen-lockfile
COPY --from=pruner /app/out/full/ ./
RUN pnpm turbo run build --filter=@booking/api

FROM base AS production-dependencies
ENV NODE_ENV=production
COPY --from=pruner /app/tsconfig.base.json ./tsconfig.base.json
COPY --from=pruner /app/out/json/ ./
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store pnpm install --prod --frozen-lockfile
COPY --from=pruner /app/out/full/ ./
COPY --from=builder /app/packages ./packages
# Regenerate the Prisma client against the PRODUCTION dependency tree. Copying it
# from the builder does not work: pnpm generates into the content-addressed store
# path of @prisma/client, which differs between the two installs.
RUN pnpm --filter=@booking/api exec prisma generate

FROM base AS runner
ENV NODE_ENV=production
# OpenSSL is required by the Prisma query engine on Alpine.
RUN apk add --no-cache openssl
COPY --from=production-dependencies --chown=node:node /app /app
COPY --from=builder --chown=node:node /app/apps/api/dist /app/apps/api/dist
USER node
WORKDIR /app/apps/api
EXPOSE 3000
# Liveness only — /health/ready additionally checks Postgres + Redis and is what
# the compose healthcheck uses, so a container is not "healthy" until both are.
CMD ["node", "dist/main.js"]
