# Phase 0 — Foundation

Infrastructure groundwork. Nothing user-facing yet; everything here is a prerequisite for Phase 1.

| # | Task | Depends on |
|---|------|-----------|
| 01 | [Scaffold monorepo & dev environment](01-scaffold-monorepo.md) | — |
| 02 | [Initialize shared packages](02-shared-packages.md) | 01 |
| 03 | [NestJS skeleton + hexagonal conventions](03-nestjs-skeleton.md) | 01, 02 |
| 04 | [Prisma schema, RLS & tenant context](04-prisma-rls-tenant-context.md) | 03 |
| 05 | [Auth & RBAC foundation](05-auth-rbac-foundation.md) | 04 |
| 06 | [Outbox pattern + money/time helpers](06-outbox-money-time.md) | 04 |

**Phase Definition of Done:** `pnpm turbo lint typecheck test` green + demo runs via `docker compose up`.
