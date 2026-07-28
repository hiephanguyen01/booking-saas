# Architecture

System-at-a-glance for BookingOS. For *what* the product does see [`../TONG-QUAN.md`](../TONG-QUAN.md);
for *how we build* see [`../AGENTS.md`](../AGENTS.md) and [`conventions.md`](./conventions.md).

## Processes

Three deployables + shared packages, orchestrated by Turborepo over pnpm workspaces:

| Process | Package | Runtime | Port |
| --- | --- | --- | --- |
| API | `@booking/api` | NestJS 11 (hexagonal) | `PORT`, default **3000** |
| Storefront | `@booking/storefront` | React Router 8 framework mode (SSR) | **5173** |
| Dashboard | `@booking/dashboard` | React Router 8 framework mode (SSR) | **5174** |

Backing services (local `docker-compose.yml`): **PostgreSQL 16**, **Redis 7**, **Mailpit** (SMTP
:1025 / UI :8025), **MinIO** (S3 :9000 / console :9001).

## Request & data flow (BFF)

Both frontends are **Backends-For-Frontend**: the browser talks only to its own SSR server, which talks
to the API server-to-server.

```
Browser ──▶ RR8 loader/action (server)
              │  storefront app/lib/server/*.server.ts
              │  dashboard  app/lib/*.server.ts       → @booking/api-client
              │                                          (cookie sid/rid, zod-validated responses)
              ▼
           NestJS controller ──▶ use-case ──▶ repository-port ──▶ Prisma repository
                                     │
                                     ▼  TenantDbService.forTenant(tenantId, tx => …)
                                 Postgres (RLS: app.tenant_id GUC set on the tx)
```

- The browser never calls the API directly and never holds a token — the session cookie is `httpOnly`
  (dashboard sessions are Redis-backed; the cookie carries only a signed id). See
  [ADR 0001](./decisions/0001-opaque-sessions-over-jwt.md).
- SePay checkout is the one intentional browser-to-provider hop: the storefront action receives signed
  form fields server-to-server, validates the provider origin, then renders a browser `POST` form to
  SePay. The Merchant Secret Key remains encrypted in the API and is never sent to the browser;
  payment confirmation verifies the Payment Gateway IPN `X-Secret-Key`. See
  [`payments-sepay.md`](./payments-sepay.md).
- Every tenant-scoped operation runs in **one** `forTenant` transaction that sets `app.tenant_id`, so
  Postgres Row-Level Security filters every query. See [`data-model.md`](./data-model.md) and
  [ADR 0002](./decisions/0002-rls-tenant-isolation-forTenant.md).

## Authorization

Global `SessionAuthGuard` → `PermissionsGuard`, **deny-by-default**: a route must be `@Public()`,
`@AuthenticatedOnly()`, or `@RequirePermissions('scope.resource.action')`. The client names its scope
with `x-tenant-id` / `x-partner-id` headers; the guard verifies the user holds a role assignment there
(never trusting the header for data), then seeds the tenant context for RLS. Permissions resolve
`role_assignments → roles → role_permissions → permissions`, cached in Redis. The permission catalog
(39 keys) and 7 system roles are fixed in code (`identity-access/domain/permission-catalog.ts`) and
seeded — 3 tiers: **platform / tenant / partner**.

## Inter-module communication — the outbox

The 13 bounded contexts never import each other. A producer writes an event **in the same transaction**
as its state change (`OutboxService.emit(tx, {eventType, payload})` → `outbox_events`); a consumer
registers `OutboxHandlerRegistry.register(eventType, handler)`. The BullMQ relay
(`shared/outbox/outbox-relay.worker.ts`) polls every 2s, claims a batch of 20 with
`FOR UPDATE SKIP LOCKED`, dispatches each handler inside the event's tenant context, and retries with
exponential backoff (capped 300s). After 20 failed attempts the relay sets `dead_lettered_at` and
excludes that row from future claims. Timing uses the **DB clock** (`now()`), never `Date.now()`.
See [ADR 0003](./decisions/0003-outbox-for-inter-module.md).

Settlement event chain: `payment.succeeded` is consumed independently by Booking (confirmation) and
Finance (held custody); `booking.completed/no_show` freezes the applicable split and opens the dispute
window; a customer claim locks it as `disputed`; Tenant adjudication emits either release or refund;
the release worker posts the revenue journal only after the deadline. `refund.completed` is provider/
manual-transfer truth and converges Booking + Settlement idempotently. Payout allocations then map
released booking debt into guarded payout runs. Other consumers react independently. See
[`settlement-flow.md`](./settlement-flow.md).

## Backend internals

`apps/api/src/`:

- `modules/*` — bounded contexts, each `domain/ · application/ · infrastructure/`:
  identity-access, tenancy, partner, catalog, listing, scheduling, booking, payments, promotions,
  finance, affiliate, notification, reviews, favorites, content-reports, and
  **administrative-division** (Vietnamese provinces/wards reference data).
- `shared/*` — 11 cross-cutting concerns (no business logic): tenant-context, prisma, redis, outbox,
  audit, storage, validation, openapi, health, money, time.

Database access uses **one** `PrismaService` exposing two pools — `app` (`DATABASE_URL`, app_user,
RLS-forced) and `admin` (`ADMIN_DATABASE_URL`, app_admin, BYPASSRLS for platform/webhook/reconciliation
work). Migrations run as `MIGRATE_DATABASE_URL` (superuser). Background workers (outbox relay,
reminders, reconciliation, settlement-release, domain-verification) have no request context and
resolve `tenant_id` from the payload before calling `forTenant`. Reconciliation rebuilds payment,
refund and missing-refund projections from durable database facts; operational queries are in
[`runbooks/finance-reconciliation.md`](./runbooks/finance-reconciliation.md).

Stateful writes use domain transition graphs plus repository compare-and-swap. Listing/group
moderation guards status, listing content edits guard `updated_at`, and content-report moderation
guards the loaded status; a concurrent loser receives 409 before audit/outbox. The append-only
tenancy subscription stream has one current-subscription read adapter: newest `starts_at`, then
`created_at`, with PostgreSQL `now()` returned by the same statement for liveness, limits, subscriber
counts and platform health.

Payment gateway configuration is a provider-discriminated contract. Credentials are encrypted at
rest, validated again after decryption, and never returned; invalid/tampered stored data fails closed.
Dynamic tenant/listing JSON remains open by design, while provider handoffs, refund evidence and
HTTP queries are typed/validated at their boundary.

## Frontend internals

React Router 8 framework mode: each route exports `loader` (server data), `action` (server mutation),
and a default component. Storefront root middleware rejects cross-origin unsafe methods before it
authenticates the request into AsyncLocalStorage; exact liveness/readiness paths bypass auth and tenant
resolution. Storefront runtime configuration is validated once at its server boundary and production
cannot use loopback fallbacks. The storefront resolves its tenant from the `Host` header and injects
per-tenant theme CSS at SSR; the dashboard resolves scope from the login session and is organized
`routes/<area>` (route modules) + `features/<name>/{components,server,lib}`. Shared UI is `@booking/ui`
(raw TSX, Tailwind v4 CSS-first); the FE↔BE contract is `@booking/contracts` (zod). See the per-app
`CLAUDE.md` and [`conventions.md`](./conventions.md).

## Build, verification & CI

There are **no tests** by owner decision; do not add test files, runners, scripts or CI test steps
([ADR 0005](./decisions/0005-no-tests-policy.md)). Verification is
`pnpm turbo lint typecheck build`, `pnpm --filter=@booking/api check:rls`, and runtime smoke against
local infrastructure.

CI (`.github/workflows/ci.yml`, "Frontend CI") runs for pull requests into `main` (or manually). It
lints/typechecks/builds the two frontends, typechecks the API, and runs the architecture, Storefront
security and API RLS static guards. Turbo builds shared workspace dependencies once through the task
graph. Docker images are not rebuilt in CI; the manual Deploy workflow builds and pushes only the
selected app(s).

## Deployment status

All three apps are containerised: `apps/{api,storefront,dashboard}/Dockerfile`, multi-stage with
`turbo prune … --docker`. **`docker-compose.deploy.yml` runs staging and production from one file** —
they differ only by env file (`.env.stg` / `.env.prod`, template in `.env.deploy.example`) and the
hostnames in it. A one-shot `migrate` service applies `prisma migrate deploy` from the API image
before `api` starts; `nginx:1.27-alpine` routes by Host with the storefront as the **default server**
so tenant custom domains work without an nginx change. Postgres, Redis and S3 are managed services
outside the compose file. The manual Deploy workflow publishes selected images to GHCR and pins the
server to immutable commit tags.

Full runbook — first deploy, seeding, releases, rollback, scaling: [`deployment.md`](./deployment.md).

`docker-compose.yml` at the repo root remains **local dev only** (Postgres, Redis, Mailpit, MinIO).
