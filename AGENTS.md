# AGENTS.md — BookingOS: Booking SaaS + Marketplace

Shared, tool-agnostic context for every AI agent (Claude Code, Codex, Cursor, Gemini CLI, …).
Claude Code reads this via `@AGENTS.md` from `CLAUDE.md`; other tools read it directly.

> **This file was rebuilt from the actual code on 2026-07-27.** The product/design spec is
> [`TONG-QUAN.md`](./TONG-QUAN.md) (English, the source of truth for *what* we build); the
> ticket-by-ticket plan is [`tasks/`](./tasks/). When a doc and the code disagree, **the code wins** —
> and please fix the doc. Deep docs live in [`docs/`](./docs/); read the one that matches your task.

## What BookingOS is

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

The API's internals: 18 bounded contexts under `apps/api/src/modules/*` (identity-access, tenancy,
partner, catalog, listing, scheduling, booking, payments, promotions, finance, affiliate, notification,
administrative-division, reviews, content-reports, favorites, storage, legal) + 13 cross-cutting concerns
under `apps/api/src/shared/*` (audit, domain, health, http, money, openapi, outbox, pagination,
prisma, redis, tenant-context, time, validation). Details in
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
- **A partner's edit of an already-reviewed listing never touches the live row**: it is parked in
  `listing_revisions` and applied only on tenant approval, so the storefront only ever reads approved
  content and editing no longer takes a listing offline — see [ADR 0007](./docs/decisions/0007-listing-edit-revisions.md).
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
- **Prices are VAT-inclusive gross and every commission rate applies to the amount net of VAT.**
  Extract VAT with `vatFromGross`, never `percentOfBps`. The rate is resolved for the **service date**
  and frozen into `commission_snapshot.tax`; customer-facing copy reads it from there or from the
  quote, never from a constant. See [`docs/features/vat.md`](./docs/features/vat.md).
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
| **Full static check** | `pnpm check:no-tests && pnpm check:module-cycles && pnpm check:frontend-structure && pnpm --filter=@booking/storefront security && pnpm turbo lint typecheck build && pnpm --filter=@booking/api check:rls` |
| No-tests policy | `pnpm check:no-tests` |
| Module-cycle guard | `pnpm check:module-cycles` |
| Frontend structure guard | `pnpm check:frontend-structure` |
| Lint / Typecheck / Build (all) | `pnpm lint` · `pnpm typecheck` · `pnpm build` |
| Format | `pnpm format` |
| Local infra | `docker compose up -d` (postgres:16, redis:7, mailpit, minio) — **dev only** |
| Deploy stg / prod | `docker compose --env-file .env.{stg,prod} -f docker-compose.deploy.yml up -d` — see [`docs/deployment.md`](./docs/deployment.md) |
| Migrate DB | `pnpm --filter=@booking/api prisma:deploy` |
| Regenerate Prisma client | `pnpm --filter=@booking/api prisma:generate` |
| Seed demo data | `pnpm --filter=@booking/api seed` |
| Create MinIO bucket | `pnpm --filter=@booking/api storage:init` |
| RLS coverage check | `pnpm --filter=@booking/api check:rls` |

> `--filter=api` also resolves (pnpm matches the directory). CI (`.github/workflows/ci.yml`, "Frontend
> CI") runs the no-tests policy guard, module-cycle and frontend-structure guards, Storefront security
> gate, API typecheck, frontend lint/typechecks/production builds, and `check:rls`. Turbo builds
> required workspace packages once through the dependency graph. CI runs for pull requests into
> `main` (or manually); container images are built only by the manual Deploy workflow.

## Local run recipe

```bash
docker compose up -d                                   # postgres, redis, mailpit, minio
cp .env.example .env                                   # the only env file; every app/CLI reads this root file
pnpm install
pnpm --filter=@booking/api prisma:deploy               # schema + RLS policies + db roles
pnpm --filter=@booking/api seed                        # permissions, roles, admin, 2 demo tenants
pnpm --filter=@booking/api storage:init                # MinIO bucket + public-read policy
pnpm dev                                               # api :3000, storefront :5173, dashboard :5174
```

- **Storefront** (`localhost:5173`) serves the **BookingOS platform landing** — a single-label host
  (`localhost`) or a bare IP can never be a tenant domain, so it skips tenant resolution entirely.
  A tenant storefront is reached on its own host: `bookingstudio.localhost:5173`,
  `bookingstad.localhost:5173`.
- **Dashboard** (`localhost:5174`) — log in with a seeded user below.
- **OTP emails** (registration / password reset) land in **Mailpit** at `localhost:8025`.

**Two demo tenants**, one seed for both environments — every tenant registers its staging host
*and* its `.localhost` host, so no `SEED_ENV` switch is needed:

| Tenant | Vertical | Staging | Local | Catalog |
| --- | --- | --- | --- | --- |
| **BookingStudio** | studio | `bookingstudio.stg.bookingos.vn` | `bookingstudio.localhost` | 6 types, 121 listings |
| **BookingStad** | sport | `bookingstad.stg.bookingos.vn` | `bookingstad.localhost` | 5 court types (bóng đá, bóng rổ, tennis, cầu lông, pickleball), 40 courts |

BookingStad's subscription is a **trial expiring in 5 days** on purpose — it is what fills the admin
board's "expiring soon" queue. `trial` is a billable status, so every partner/booking flow still works.

Seeded logins (override via `SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD`):

| Who | Email | Password |
| --- | --- | --- |
| Platform admin | `admin@bookingos.local` | `admin-dev-password` |
| BookingStudio owner | `owner@bookingstudio.vn` | `demo-password` |
| BookingStudio partner | `giang@giangstudio.vn` | `demo-password` |
| BookingStudio customer | `customer@bookingstudio.vn` | `demo-password` |
| BookingStad owner | `owner@bookingstad.vn` | `demo-password` |
| BookingStad partner | `hoang@sanhoanggia.vn` | `demo-password` |

> Renaming the tenant changed its slug, so seeding **over an existing dev database fails** on
> duplicate booking codes. Reset first: `pnpm --filter=@booking/api exec prisma migrate reset`.

### Seed scopes

`SEED_SCOPE` picks how much is seeded. Both scopes are idempotent.

| Scope | Command | Seeds |
| --- | --- | --- |
| **production** | `SEED_SCOPE=tenants SEED_ADMIN_EMAIL=… SEED_ADMIN_PASSWORD=… SEED_OWNER_PASSWORD=… pnpm --filter=@booking/api seed` | Permissions, roles, admin, plans, and both tenants' **settings**: domains, theme, subscription, owner, cancellation policy, commission rules, listing types + categories. **No partners, listings, bookings or promotions.** |
| **dev / staging** (default) | `pnpm --filter=@booking/api seed` | The above **plus** partners, 161 listings, bookings, promotions, affiliate and the platform-health fixtures. |

`SEED_OWNER_PASSWORD` is **required** in `tenants` scope — the seed refuses rather than create a real
tenant owner with the shared demo password. Dev falls back to `demo-password`.

```
prisma/
  seed.ts                        entry — reads SEED_SCOPE, wires the rest
  seed/
    client.ts   scope.ts   shared.ts   platform.ts   plans.ts
    administrative-divisions.ts
    catalog/    studio-catalog.ts   sport-catalog.ts     type defs + upsert helpers
    tenants/    booking-studio.ts   booking-stad.ts      SETTINGS (production)
    demo/       studio-demo.ts      sport-demo.ts        partners, listings, fixtures
```

Each `catalog/*` file exports its type/category seeder (`seed*CatalogTypes`, used by `tenants/`) and
its listing generator (used by `demo/`) from the same definition array, so the attribute schema can
never drift between what production configures and what the demo fills in.

## Deeper docs

- [`docs/architecture.md`](./docs/architecture.md) — system, request/data flow, auth, outbox, deploy status
- [`docs/data-model.md`](./docs/data-model.md) — models, RLS/GiST/ledger invariants, money & rate units
- [`docs/conventions.md`](./docs/conventions.md) — backend & frontend conventions, errors, migrations, i18n
- [`docs/glossary.md`](./docs/glossary.md) — domain terminology
- [`docs/deployment.md`](./docs/deployment.md) — staging & production containers, migrations, releases, scaling
- [`docs/deployment-runbook.md`](./docs/deployment-runbook.md) — step-by-step first deploy (AWS + Cloudflare R2 + Resend)
- [`docs/decisions/`](./docs/decisions/) — ADRs (opaque sessions, RLS, outbox, migrations, no tests, no services, listing edit revisions, legal documents)
- [`docs/features/`](./docs/features/) — per-feature deep dives ([favorites](./docs/features/favorites.md), [legal documents & consent](./docs/features/legal-documents.md), [storefront PWA](./docs/features/storefront-pwa.md), [VAT](./docs/features/vat.md))
- [`docs/deprecated-artifacts.md`](./docs/deprecated-artifacts.md) — dead code slated for deletion (don't extend it)
- Per-subtree `CLAUDE.md`: [`apps/api`](./apps/api/CLAUDE.md) · [`apps/storefront`](./apps/storefront/CLAUDE.md) · [`apps/dashboard`](./apps/dashboard/CLAUDE.md) · [`packages/ui`](./packages/ui/CLAUDE.md) · [`packages/contracts`](./packages/contracts/CLAUDE.md)
