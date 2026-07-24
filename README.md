# Booking SaaS + Marketplace Platform

Multi-tenant booking SaaS (design: `TONG-QUAN.md`, task breakdown: `tasks/`).

## Stack

pnpm + Turborepo · NestJS 11 (hexagonal) · Prisma + PostgreSQL 16 (RLS) · Redis + BullMQ · Zod contracts (`@booking/contracts`). Targeted automated tests protect security, concurrency, money, time, parser, and domain invariants.

## Getting started

```bash
pnpm install
docker compose up -d            # postgres, redis, mailpit, minio
# if another postgres already uses 5432: POSTGRES_PORT=5433 docker compose up -d

cp .env.example .env            # adjust ports if needed

pnpm --filter=@booking/api prisma:deploy # applies schema + RLS policies + db roles
pnpm --filter=@booking/api seed          # permission catalog, system roles, dev admin
pnpm --filter=@booking/api start:dev     # API on :3000
```

Dev admin: `admin@bookify.local` / `admin-dev-password` (override via `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`).

## Frontend apps

```bash
pnpm --filter=@booking/storefront dev # customer site, multi-tenant by Host header (:5173)
pnpm --filter=@booking/dashboard dev  # 4 role areas: /admin /tenant /partner /affiliate
```

React Router 8 framework mode (SSR) + Tailwind v4. Storefront resolves the tenant in `app/lib/tenant.server.ts` and themes via tenant-configured semantic CSS variables.

## Agent skills

Project-level skills in `.agents/skills/` (symlinked into `.claude/skills/`), installed via `npx skills add`:

| Skill | For |
| --- | --- |
| `react-router-framework-mode` | RR framework routes/loaders/actions conventions (official, remix-run) |
| `design-taste-frontend` | Anti-generic design direction for storefront/dashboard UI |
| `prisma-client-api`, `prisma-cli` | Query patterns + migrate workflows (official, prisma) |
| `nestjs-best-practices` | NestJS architecture patterns |
| `supabase-postgres-best-practices` | Postgres performance & RLS-heavy schema guidance |

## Commands

```bash
pnpm test                       # targeted package tests
pnpm turbo lint typecheck build # static checks and production builds
```

Storefront-only tests:

```bash
pnpm --filter=@booking/storefront test
```

## Architecture notes (Phase 0)

- **Two DB pools**: `app_user` (RLS-FORCED) for tenant work, `app_admin` (BYPASSRLS) for platform admin/workers. Business code must run inside `TenantDbService.forTenant()` — one interactive transaction per use case with `app.tenant_id` set via `SET LOCAL`.
- **RLS convention**: every table with a `tenant_id` column needs FORCE RLS + a policy in a hand-written migration; `pnpm --filter=@booking/api check:rls` (static script, runs in CI) fails otherwise.
- **Deny-by-default authz**: routes must be `@Public()`, `@AuthenticatedOnly()`, or declare `@RequirePermissions(...)`; anything else is 403. Permission catalog + system roles live in `modules/identity-access/domain/permission-catalog.ts` and are seeded, never edited via UI.
- **Outbox**: modules communicate via `OutboxService.emit(tx, ...)` inside the business transaction; the BullMQ relay delivers with retry/backoff. Time comparisons for the outbox run on the **DB clock** (`now()`), never `Date.now()`.
- **Money/time**: VND is `bigint` đồng (`shared/money`), DB timestamps are UTC `timestamptz`; timezone math at the edges only (`shared/time`).
