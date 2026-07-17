# Data model

The schema is the source of truth: **[`../apps/api/prisma/schema.prisma`](../apps/api/prisma/schema.prisma)**
(47 models, 40 enums). This page documents the **invariants and units** that Prisma can't express —
read it before touching money, migrations, or tenant tables. Domain term definitions are in
[`glossary.md`](./glossary.md).

## Model groups

- **Identity & access** — `User` (a single table for every actor; `password_hash` is nullable for
  guest-checkout users), `Session`, `Role`, `Permission`, `RolePermission`, `RoleAssignment`.
- **Tenancy** — `Tenant`, `TenantDomain` (custom domains + TXT verification), `SubscriptionPlan`,
  `Subscription`; tenant `theme_config`, `settings` (feature flags), `limits`.
- **Partner** — `Partner`, applications/approval, identity verification, payout info.
- **Catalog & listings** — `ListingType` (dynamic attribute schema + `searchConfig`), `Listing`,
  `ListingGroup`, `Resource`, pricing rules; moderation status.
- **Scheduling & booking** — availability rules/exceptions, `Booking`, `BookingHold` (audit mirror of a
  Redis hold), status history, inventory.
- **Payments & finance** — `Payment`, gateway configs, `Refund`; `CommissionRule`, the double-entry
  ledger (`Journal` / `LedgerEntry`), `Payout`.
- **Promotions & affiliate** — promo codes, partner promotions, campaigns; `ReferralLink`,
  `ReferralClick`, `AffiliateCommission`.
- **Reference** — administrative divisions (Vietnamese provinces/wards), audit logs, outbox events,
  notifications.

## Invariants enforced in the database (hand-written SQL, not Prisma)

Everything below lives in hand-authored migration SQL — Prisma can't express it, and `check:rls`
guards the RLS parts in CI.

1. **Tenant isolation (RLS).** Every table with `tenant_id uuid NOT NULL` has `ENABLE` + **`FORCE ROW
   LEVEL SECURITY`** and a `tenant_isolation` policy:
   `USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)` (same for `WITH
   CHECK`). It only takes effect when queries run through the RLS-bound `app_user` role inside a
   `forTenant` transaction that sets the GUC. See [ADR 0002](./decisions/0002-rls-tenant-isolation-forTenant.md).
2. **No double-booking (GiST exclusion).** `bookings` carries a `tstzrange` `blocked_period` and an
   `EXCLUDE USING gist (resource_id WITH =, blocked_period WITH &&)` constraint, filtered to active
   statuses and to non-inventory / non-class booking modes (inventory and class modes oversell by
   design up to capacity). Requires the `btree_gist` extension.
3. **Double-entry ledger.** Ledger entries are grouped by `journal_id`; a `CHECK` enforces each row is
   one-sided (debit XOR credit), an **append-only trigger** blocks updates/deletes, and a **deferred
   constraint trigger** enforces `sum(debit) = sum(credit)` per journal at commit. Never post a single
   entry — post a balanced journal. See [`glossary.md`](./glossary.md) → Ledger.
4. **Other SQL-only bits:** extensions `btree_gist`, `citext`, `pgcrypto`; `NULLS NOT DISTINCT` unique
   indexes; the `app_user` / `app_admin` / migrate roles.

## Units & types (hard rules)

- **Money is `bigint` VND** (đồng) everywhere — never a float, never cents. Format/parse with
  `apps/api/src/shared/money`.
- **Rates are integer percent 0–100.** `CommissionRule.tenantRate` / `platformRate` are whole percents
  (seed uses `15` = 15%, `2` = 2%), **not** basis points. (An older doc said "basis points" — it was
  wrong.) Rounding follows `TONG-QUAN.md` §18; the finance use-cases own it.
- **Time is `timestamptz` UTC.** Do timezone math only at the edges (`apps/api/src/shared/time`).

## What is *not* in the schema

- **Holds & OTPs live in Redis** (the source of truth). `BookingHold` is only an audit mirror; email
  OTPs (registration, password reset, guest checkout) have no table. Key shapes/TTLs live in the
  identity-access and booking infrastructure adapters.
- **JSON blobs** (`Listing.modeConfig`, booking `pricingSnapshot`/`commissionSnapshot`/
  `promotionSnapshot`/`cancellationPolicySnapshot`, `ListingType.searchConfig`, `Tenant.settings`,
  `SubscriptionPlan.limits`, `Payout.evidence`) are typed & validated by `@booking/contracts`, not by
  the DB. Check the contract when reading/writing one.
- **The booking state machine** (allowed transitions, who may trigger each, what `expiresAt` expiry
  does per status) is in the booking module's use-cases + `TONG-QUAN.md` §8, not the enum.

## Migrations

Hand-authored, timestamped folders in `apps/api/prisma/migrations/`, applied with
`pnpm --filter=@booking/api prisma:deploy`. `prisma migrate dev` is **not** used in this repo. Adding a
tenant-scoped table requires a companion RLS migration or `check:rls` fails CI. The RLS/role
migrations, ledger triggers, and the bookings GiST constraint are **no-touch zones** — see
[ADR 0004](./decisions/0004-hand-written-migrations.md) and [`conventions.md`](./conventions.md) →
Migrations.

## Seed

`apps/api/prisma/seed.ts` (`pnpm --filter=@booking/api seed`, idempotent) loads: 39 permissions + 7
system roles, a platform admin, the full Vietnamese administrative divisions (34 provinces / 3321
wards), and a demo world — the **StudioHub** tenant (6 listing types, ~120 listings, bookings, a
payout, promotions, an affiliate) plus a second trial tenant. Seeded logins are in
[`../AGENTS.md`](../AGENTS.md).
