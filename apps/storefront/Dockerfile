# syntax=docker/dockerfile:1.7
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
RUN turbo prune @booking/storefront --docker

FROM base AS builder
ARG STOREFRONT_BUILD_ID
ENV STOREFRONT_BUILD_ID=${STOREFRONT_BUILD_ID}
COPY --from=pruner /app/tsconfig.base.json ./tsconfig.base.json
COPY --from=pruner /app/out/json/ ./
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store pnpm install --frozen-lockfile
COPY --from=pruner /app/out/full/ ./
RUN pnpm turbo run build --filter=@booking/storefront

FROM base AS production-dependencies
ENV NODE_ENV=production
COPY --from=pruner /app/tsconfig.base.json ./tsconfig.base.json
COPY --from=pruner /app/out/json/ ./
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store pnpm install --prod --frozen-lockfile
COPY --from=pruner /app/out/full/ ./
COPY --from=builder /app/packages ./packages

FROM base AS runner
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
COPY --from=production-dependencies --chown=node:node /app /app
COPY --from=builder --chown=node:node /app/apps/storefront/build /app/apps/storefront/build
USER node
EXPOSE 3000
CMD ["pnpm", "--filter", "@booking/storefront", "start"]
