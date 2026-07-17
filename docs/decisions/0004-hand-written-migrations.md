# ADR 0004 — Hand-written migrations, not `prisma migrate dev`

**Status:** Accepted (documented 2026-07-17).

## Context

The schema depends on Postgres features Prisma cannot express: RLS policies + `FORCE ROW LEVEL
SECURITY`, DB roles (`app_user`/`app_admin`), the `tstzrange` GiST exclusion constraint, ledger
triggers (append-only + deferred balance), `NULLS NOT DISTINCT` indexes, and extensions. `prisma migrate
dev` would generate migrations that drop or ignore all of that, and in this environment it is unreliable
anyway.

## Decision

Author migrations **by hand**:

- Edit `schema.prisma`, then create a new timestamped folder under `apps/api/prisma/migrations/` with a
  `migration.sql` written by hand (including any RLS block for a new tenant-scoped table).
- Apply with `pnpm --filter=@booking/api prisma:deploy` (`prisma migrate deploy`), then
  `prisma:generate`. Do **not** run `prisma migrate dev`.
- `pnpm --filter=@booking/api check:rls` (CI) fails if a `tenant_id` table is missing FORCE RLS + policy.

## Consequences

- Full control over SQL the ORM can't model; migrations are reviewable plain SQL.
- More manual effort per schema change, and the developer owns correctness (Prisma won't diff it for
  you).
- **No-touch zones:** the RLS role/policy migrations, ledger triggers/constraints, and the bookings GiST
  exclusion constraint. Change these only deliberately and verify against the dev DB. See
  [`../conventions.md`](../conventions.md) → Migrations.
