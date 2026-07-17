# Architecture

System-at-a-glance for Bookify. For *what* the product does see [`../TONG-QUAN.md`](../TONG-QUAN.md);
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
              │  app/lib/*.server.ts  →  @booking/api-client  (cookie sid/rid, zod-validated responses)
              ▼
           NestJS controller ──▶ use-case ──▶ repository-port ──▶ Prisma repository
                                     │
                                     ▼  TenantDbService.forTenant(tenantId, tx => …)
                                 Postgres (RLS: app.tenant_id GUC set on the tx)
```

- The browser never calls the API directly and never holds a token — the session cookie is `httpOnly`
  (dashboard sessions are Redis-backed; the cookie carries only a signed id). See
  [ADR 0001](./decisions/0001-opaque-sessions-over-jwt.md).
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
exponential backoff (capped 300s, **no dead-letter**). Timing uses the **DB clock** (`now()`), never
`Date.now()`. See [ADR 0003](./decisions/0003-outbox-for-inter-module.md).

Example event chain: `booking.completed` → finance posts ledger entries + computes a commission
snapshot; other consumers (notifications, affiliate) react independently.

## Backend internals

`apps/api/src/`:

- `modules/*` — 13 bounded contexts, each `domain/ · application/ · infrastructure/`:
  identity-access, tenancy, partner, catalog, listing, scheduling, booking, payments, promotions,
  finance, affiliate, notification, **administrative-division** (Vietnamese provinces/wards reference
  data).
- `shared/*` — 11 cross-cutting concerns (no business logic): tenant-context, prisma, redis, outbox,
  audit, storage, validation, openapi, health, money, time.

Database access uses **one** `PrismaService` exposing two pools — `app` (`DATABASE_URL`, app_user,
RLS-forced) and `admin` (`ADMIN_DATABASE_URL`, app_admin, BYPASSRLS for platform/webhook/reconciliation
work). Migrations run as `MIGRATE_DATABASE_URL` (superuser). Background workers (outbox relay,
reminders, reconciliation, domain-verification) have no request context and resolve `tenant_id` from
the payload before calling `forTenant`.

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

## Build & CI

Turborepo tasks: `build` (`^build`, outputs `dist`/`build`/`.react-router`), `dev`, `lint`, `typecheck`
(`^build`). **No test task** ([ADR 0005](./decisions/0005-no-tests-policy.md)). CI
(`.github/workflows/ci.yml`, "Frontend CI") runs `pnpm turbo run lint typecheck build` for the **two
frontends**, the Storefront static security gate, and `pnpm --filter=@booking/api check:rls`, then
docker-builds the two frontend images
(`push: false`). The API is **not** compiled or linted directly in CI — run `pnpm typecheck`/`build`
locally after backend changes.

## Deployment status

**No production deployment exists yet — this is dev-only.** The repo contains frontend Dockerfiles
(`apps/{storefront,dashboard}/Dockerfile`, multi-stage with `turbo prune … --docker`), a
`docker-compose.frontend.yml` (storefront + dashboard behind `nginx:1.27-alpine` on :8080, routing by
Host), and `docker/nginx/default.conf`. There is **no API Dockerfile**, no registry push, and no
Vercel/Fly/Render config. Treat the frontend compose stack as a not-yet-wired starting point, not a
live topology.
