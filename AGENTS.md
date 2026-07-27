# AGENTS.md — Bookify: Booking SaaS + Marketplace

Shared, tool-agnostic context for every AI agent (Claude Code, Codex, Cursor, Gemini CLI, …).
Claude Code reads this via `@AGENTS.md` from `CLAUDE.md`; other tools read it directly.

> **This file was rebuilt from the actual code on 2026-07-27.** The product/design spec is
> [`TONG-QUAN.md`](./TONG-QUAN.md) (English, the source of truth for *what* we build); the
> ticket-by-ticket plan is [`tasks/`](./tasks/). When a doc and the code disagree, **the code wins** —
> and please fix the doc. Deep docs live in [`docs/`](./docs/); read the one that matches your task.

## What Bookify is

A multi-tenant **Booking-Platform-as-a-Service + marketplace** for Vietnam. Each business (**tenant**)
gets a branded booking storefront; **partners** list bookable resources inside a tenant; **customers**
book & pay; the **platform** earns subscription + per-booking commission; **affiliates** refer for a
cut. Money moves through a double-entry **ledger**; tenant isolation is enforced by **Postgres RLS**;
double-booking is blocked by a `tstzrange` GiST **exclusion constraint**; access is **3-tier dynamic
RBAC** (platform / tenant / partner). Phase 0 (foundation) and Phase 1 (Studio MVP) are **implemented**;
Phases 2–3 are spec + tickets only. See [`docs/glossary.md`](./docs/glossary.md) for domain terms.

## ⛔ Hard rules (override everything — specs, tickets, skills, older snippets)

1. **NO TESTS, ever.** Zero test files by owner decision. Never add `*.spec.*`/`*.test.*`/e2e, nor
   vitest/jest/playwright config, `test` scripts, or CI test steps — even if a ticket says to.
   Verification = `typecheck` + `lint` + `build` + running the app. See
   [ADR 0005](./docs/decisions/0005-no-tests-policy.md).
2. **Backend flow is `controller → use-case → repository-port → repository`. No service classes** in
   the application layer. Sanctioned alternatives (pure domain function / use-case / port+adapter) in
   [`docs/conventions.md`](./docs/conventions.md) and [ADR 0006](./docs/decisions/0006-hexagonal-no-services.md).
3. **One use-case = one file:** exactly one exported `@Injectable XxxUseCase` with a single public `execute()`.

## Layout

```
apps/api          @booking/api        NestJS 11, hexagonal, RLS-aware       PORT (default 3000)
apps/storefront   @booking/storefront React Router 8 SSR, tenant by Host    5173
apps/dashboard    @booking/dashboard React Router 8 SSR, /admin /tenant /partner /affiliate   5174
packages/contracts @booking/contracts zod schemas + inferred types (FE↔BE contract) → dist
packages/ui       @booking/ui         shadcn + GenericForm + theme, raw TSX (no build)
packages/api-client @booking/api-client typed server-side HTTP client (loaders/actions)
packages/auth     @booking/auth       permission helpers (hasScope/hasPermission/defaultAreaFor)
packages/i18n     @booking/i18n        i18next locales (storefront only; dashboard is Vietnamese-hardcoded)
```

The API's internals: 13 bounded contexts under `apps/api/src/modules/*` (identity-access, tenancy,
partner, catalog, listing, scheduling, booking, payments, promotions, finance, affiliate, notification,
**administrative-division**) + 11 cross-cutting concerns under `apps/api/src/shared/*`. Details in
[`docs/architecture.md`](./docs/architecture.md); each app/package has its own `CLAUDE.md` with local rules.

## Load-bearing always / never (violating these breaks tenancy or security)

- **All tenant data flows through `TenantDbService.forTenant(tenantId, tx => …)`** — one interactive
  transaction per business operation; it sets the `app.tenant_id` GUC so RLS applies. Repositories
  receive the `tx`, never the raw client. Never nest `forTenant`, never call it per-query.
- **Every tenant-scoped table needs `tenant_id uuid NOT NULL` + a hand-written RLS migration** (FORCE
  RLS + `tenant_isolation` policy). `pnpm --filter=@booking/api check:rls` (a static script, runs in CI)
  fails otherwise. **Migrations are hand-authored, not `prisma migrate dev`** — see [ADR 0004](./docs/decisions/0004-hand-written-migrations.md).
- **Every protected endpoint declares `@RequirePermissions('scope.resource.action')`** (or `@Public()`
  / `@AuthenticatedOnly()`). The global guard is **deny-by-default**: an undeclared route is 403.
- **Auth is opaque session cookies, not JWT** (`sid`/`rid`, SHA-256-hashed, rotated) — see [ADR 0001](./docs/decisions/0001-opaque-sessions-over-jwt.md).
- **A module's write-path side effects cross module lines via the outbox, never a direct call**:
  producer `OutboxService.emit(tx, {eventType, payload})` inside its `forTenant` tx; consumer
  `OutboxHandlerRegistry.register(eventType, handler)`. This is what keeps a state change and its
  side effects atomic. What is **allowed**: importing another module's guards/decorators/Nest module
  (auth and tenancy are de-facto framework here), and injecting another module's use-case or
  repository **port** for a synchronous read. What is **forbidden**: reaching into another module's
  `infrastructure/`, a `domain/` layer importing another module's `application/`, and **any cycle in
  the module graph** (`pnpm check:module-cycles`). Logic two contexts genuinely share moves to
  `apps/api/src/shared/domain/*` — that is where the pricing, availability and commission kernels
  live. See [ADR 0003](./docs/decisions/0003-outbox-for-inter-module.md).
- **Money is `bigint` VND** (đồng, never a float); **commission/platform rates are integer percent 0–100**;
  **time is `timestamptz` UTC**. Helpers in `apps/api/src/shared/{money,time}`.
- **Frontends never fetch the backend from the browser.** All authenticated data goes through RR
  `loader`/`action` (server→server via `@booking/api-client`); the session cookie is `httpOnly`.

## Commands (all verified against package.json / turbo.json / CI)

**Requires Node ≥ 22.22.0** (`.nvmrc` = 22.22.0; React Router 8 refuses to run below it) and
**pnpm 10.13.1**. Use pnpm only — never npm/yarn.

| Task | Command |
| --- | --- |
| Install | `pnpm install` (CI/Docker: `--frozen-lockfile`) |
| Everything, dev | `pnpm dev` (turbo, all apps) |
| One app, dev | `pnpm --filter=@booking/{api,storefront,dashboard} dev` |
| **Full static check** | `pnpm check:no-tests && pnpm check:module-cycles && pnpm --filter=@booking/storefront security && pnpm turbo lint typecheck build && pnpm --filter=@booking/api check:rls` |
| No-tests policy | `pnpm check:no-tests` |
| Module-cycle guard | `pnpm check:module-cycles` |
| Lint / Typecheck / Build (all) | `pnpm lint` · `pnpm typecheck` · `pnpm build` |
| Format | `pnpm format` |
| Local infra | `docker compose up -d` (postgres:16, redis:7, mailpit, minio) |
| Migrate DB | `pnpm --filter=@booking/api prisma:deploy` |
| Regenerate Prisma client | `pnpm --filter=@booking/api prisma:generate` |
| Seed demo data | `pnpm --filter=@booking/api seed` |
| Create MinIO bucket | `pnpm --filter=@booking/api storage:init` |
| RLS coverage check | `pnpm --filter=@booking/api check:rls` |

> `--filter=api` also resolves (pnpm matches the directory). CI (`.github/workflows/ci.yml`, "Frontend
> CI") runs the no-tests policy guard, Storefront security gate, contracts build, API typecheck,
> frontend lint/typechecks/production builds, `check:rls`, and both frontend Docker builds. The API is
> typechecked but is not run through a standalone production-build step in CI.

## Local run recipe

```bash
docker compose up -d                                   # postgres, redis, mailpit, minio
cp .env.example .env                                   # the only env file; every app/CLI reads this root file
pnpm install
pnpm --filter=@booking/api prisma:deploy               # schema + RLS policies + db roles
pnpm --filter=@booking/api seed                        # 39 permissions, 7 roles, admin, demo tenant "StudioHub"
pnpm --filter=@booking/api storage:init                # MinIO bucket + public-read policy
pnpm dev                                               # api :3000, storefront :5173, dashboard :5174
```

- **Storefront** (`localhost:5173`) resolves the seeded StudioHub tenant (seed maps `localhost`/`127.0.0.1`).
- **Dashboard** (`localhost:5174`) — log in with a seeded user below.
- **OTP emails** (registration / password reset) land in **Mailpit** at `localhost:8025`.

Seeded logins (override via `SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD`):

| Who | Email | Password |
| --- | --- | --- |
| Platform admin | `admin@bookify.local` | `admin-dev-password` |
| Tenant owner | `owner@studiohub.vn` | `demo-password` |
| Partner | `giang@giangstudio.vn` | `demo-password` |
| Customer | `customer@studiohub.vn` | `demo-password` |

## Deeper docs

- [`docs/architecture.md`](./docs/architecture.md) — system, request/data flow, auth, outbox, deploy status
- [`docs/data-model.md`](./docs/data-model.md) — models, RLS/GiST/ledger invariants, money & rate units
- [`docs/conventions.md`](./docs/conventions.md) — backend & frontend conventions, errors, migrations, i18n
- [`docs/glossary.md`](./docs/glossary.md) — domain terminology
- [`docs/decisions/`](./docs/decisions/) — ADRs (opaque sessions, RLS, outbox, migrations, no tests, no services)
- [`docs/deprecated-artifacts.md`](./docs/deprecated-artifacts.md) — dead code slated for deletion (don't extend it)
- Per-subtree `CLAUDE.md`: [`apps/api`](./apps/api/CLAUDE.md) · [`apps/storefront`](./apps/storefront/CLAUDE.md) · [`apps/dashboard`](./apps/dashboard/CLAUDE.md) · [`packages/ui`](./packages/ui/CLAUDE.md) · [`packages/contracts`](./packages/contracts/CLAUDE.md)
