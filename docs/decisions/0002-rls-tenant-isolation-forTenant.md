# ADR 0002 — Tenant isolation via Postgres RLS + `forTenant()`

**Status:** Accepted (documented 2026-07-17).

## Context

BookingOS is multi-tenant; a bug that leaks one tenant's data into another is the worst failure mode.
Relying on every query carrying a correct `where tenant_id = …` is one forgotten clause away from a
breach.

## Decision

Enforce isolation in the **database** with Row-Level Security, driven by a per-transaction GUC:

- Every tenant-scoped table has `tenant_id uuid NOT NULL`, `FORCE ROW LEVEL SECURITY`, and a
  `tenant_isolation` policy keyed on `current_setting('app.tenant_id')`.
- All tenant data access goes through `TenantDbService.forTenant(tenantId, tx => …)`, which opens **one**
  interactive transaction on the RLS-bound `app_user` pool and runs
  `set_config('app.tenant_id', tenantId, true)` on that same tx. Repositories receive the `tx`.
- Two pools in one `PrismaService`: `app` (app_user, RLS) and `admin` (app_admin, BYPASSRLS for
  platform/webhook/reconciliation). Migrations run as a separate superuser role.
- A static RLS coverage guard (`pnpm test`, runs in CI) fails if any `tenant_id` table lacks FORCE RLS + policy.

## Consequences

- A forgotten `where` clause is **safe** — RLS still filters. The GUC must be set on the *same*
  connection as the query, which is exactly what `forTenant` guarantees (and why you must never nest it,
  call it per-query, or use the raw client in business code).
- Background jobs have no request context and must resolve `tenant_id` from the payload before calling
  `forTenant` (the outbox relay does this).
- The RLS coverage guard proves *coverage*, not runtime correctness — sanity-check manually when editing RLS itself.
