# Task 0.1 — Scaffold monorepo & dev environment

**Phase:** 0 — Foundation · **Depends on:** — · **Design refs:** TONG-QUAN.md §5

## Goal
A working monorepo where every developer can boot the full local stack with one command.

## Scope
- [ ] pnpm workspace + Turborepo; app placeholders: `apps/api`, `apps/storefront`, `apps/dashboard`
- [ ] `docker-compose.yml`: postgres:16, redis:7, mailpit, minio
- [ ] CI pipeline: lint / typecheck / test on every push
- [ ] Base tooling: ESLint, Prettier, tsconfig shared presets

## Definition of Done
- `docker compose up` boots all infra services healthy
- `pnpm turbo lint typecheck test` passes in CI on a clean checkout
