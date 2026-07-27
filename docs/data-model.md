# Data model

The schema is the source of truth: **[`../apps/api/prisma/schema.prisma`](../apps/api/prisma/schema.prisma)**
(51 models, 48 enums). This page documents the **invariants and units** that Prisma can't express —
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
- **Payments & finance** — `Payment` (provider-neutral order/transaction references), encrypted
  tenant gateway configs, `Refund`, `BookingSettlement` (held/dispute/refund/release custody
  lifecycle), `SettlementDispute`; `CommissionRule`, the double-entry ledger (`LedgerEntry`),
  `Payout`, `PayoutAllocation`.
- **Promotions & affiliate** — promo codes, partner promotions, campaigns; `ReferralLink`,
  `ReferralClick`, `AffiliateCommission`.
- **Reviews, trust & engagement** — `Review`, `ReviewReply` (one partner reply per review), `Favorite`
  (a customer's heart on a `Listing` **or** a `ListingGroup`; `partner_id` denormalised from the
  target so the partner/tenant dashboard can scope + count without a join). See
  [`features/favorites.md`](./features/favorites.md), and `ContentReport` (customer moderation reports
  with immutable target/reporter/partner display snapshots and a tenant-owned resolution workflow).
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
4. **One-target favorites (CHECK + partial uniques).** `favorites` carries nullable `listing_id` and
   `group_id` with `CHECK ((listing_id IS NOT NULL) <> (group_id IS NOT NULL))` (exactly one target),
   plus two **partial unique** indexes — `UNIQUE (customer_id, listing_id) WHERE listing_id IS NOT NULL`
   and the `group_id` mirror — so a customer can heart a target at most once. Adds are idempotent (the
   repository swallows `P2002`).
5. **One active report per customer and target.** `content_reports` uses a partial unique index over
   `(tenant_id, reporter_user_id, target_type, target_id)` while status is `open` or `reviewing`.
   Repeated submissions are idempotent; resolved/dismissed reports remain an audit trail and allow a
   later, genuinely new report.
6. **Other SQL-only bits:** extensions `btree_gist`, `citext`, `pgcrypto`; `NULLS NOT DISTINCT` unique
   indexes; the `app_user` / `app_admin` / migrate roles.

## Units & types (hard rules)

### Listing pricing selection

`ListingType.bookingSelection` is `flexible_duration` or `fixed_packages` and is locked once the
type has listings. Flexible hourly/daily configs use base prices and min/max duration. Fixed configs
support only hourly/daily and store packages in `Listing.modeConfig`; every enabled mode needs an
active package. Package IDs are stable UUIDs, prices are positive VND strings, duration is
`durationMinutes` or `durationDays`, and `photos` is an ordered list of up to eight unique URLs whose
first entry is the package cover. Empty package galleries fall back to listing photos. The booking
stores the complete selected package, including its photos, in `pricingSnapshot`, so later edits never
rewrite history.

- Fixed package prices ignore pricing rules; promotions still apply after package subtotal.
- Public payloads expose active packages only; catalog price/filter/sort use the cheapest active package.
- Catalog cards keep using listing photos until a package is selected; detail and checkout surfaces then
  prefer the selected package gallery and fall back to the listing gallery.
- Availability cache keys include `packageId` because duration and price differ by package.
- Legacy `blocks` are ignored for quotes and stripped the next time a listing is saved.

- **Money is `bigint` VND** (đồng) everywhere — never a float, never cents. Format/parse with
  `apps/api/src/shared/money`.
- **Rates are integer percent 0–100.** `CommissionRule.tenantRate` / `platformRate` are whole percents
  (seed uses `15` = 15%, `2` = 2%), **not** basis points. (An older doc said "basis points" — it was
  wrong.) Rounding follows `TONG-QUAN.md` §18; the finance use-cases own it.
- **Time is `timestamptz` UTC.** Do timezone math only at the edges (`apps/api/src/shared/time`).

## SePay payment references

- `gateway_order_ref` is BookingOS's unique `order_invoice_number` and exists before the browser leaves the storefront.
- `gateway_order_id` and `gateway_txn_id` are populated from a verified SePay Payment Gateway IPN.
- `payment_method` stores the normalized provider method (`BANK_TRANSFER` for the current storefront flow).
- Dashboard payment history reads these normalized columns; it never queries SePay live and never exposes `gateway_payload` or merchant credentials.

## Booking settlement custody

- A successful `Payment` proves the provider accepted funds; it does not make Partner earnings
  payable immediately. `BookingSettlement.status` tracks `held → dispute_window →
  disputed/refund_pending → released/refunded`.
- `online_held_amount` excludes `security_deposit_held`; the latter is never counted as service
  revenue or minimum commission coverage.
- The completion split is visible during the dispute window, but immutable ledger entries are only
  created atomically with release. This prevents payout before the dispute buffer expires.
- `partner_payable = max(partner_gross_earning − onsite_collected_amount, 0)`.
- `PayoutAllocation` reserves released settlement amounts per payout; its state is
  `reserved → paid` or `reserved → released` on failure. A payee advisory lock and a partial unique
  index prevent concurrent open payout runs.
- `LedgerEntry.availableAt` is the explicit payout maturity timestamp. Eligibility never infers
  maturity from `createdAt`, and the settlement holding period is not applied twice.
- `Booking.refundDueAmount/refundPercent` store the exact cancellation decision before the outbox
  event so reconciliation never recomputes a historical refund using the current time.
- `Refund.affectsBookingStatus` stores whether confirmation terminates the booking. It is `false` for
  security-deposit and partial-dispute refunds, so manual confirmation/recovery cannot turn a
  completed booking into a misleading full-refund state.
- `SettlementDispute.settlementId` is unique: one customer claim per settlement. Partial dispute
  refunds are cumulative and capped by the service amount still held.
- A Partner payout is valid only when FIFO `PayoutAllocation` rows cover its exact amount; otherwise
  payout creation rolls back.
- Full state machine, event ordering, backfill and operations: [`settlement-flow.md`](./settlement-flow.md).

## What is *not* in the schema

- **Holds & OTPs live in Redis** (the source of truth). `BookingHold` is only an audit mirror; email
  OTPs (registration, password reset, guest checkout) have no table. Key shapes/TTLs live in the
  identity-access and booking infrastructure adapters.
- **JSON blobs** (`Listing.modeConfig`, booking `pricingSnapshot`/`commissionSnapshot`/
  `promotionSnapshot`/`cancellationPolicySnapshot`, `ListingType.searchConfig`, `Tenant.settings`,
  `SubscriptionPlan.limits`, `Payout.evidence`) are typed & validated by `@booking/contracts`, not by
  the DB. Check the contract when reading/writing one.
- **Calendar pricing** stays in `pricing_rules`: `date_range` covers exact daily overrides and
  `date_time_range` covers one local-date hourly window. `price` is the regular unit price and
  nullable `sale_price` is the effective partner-funded sale; booking snapshots freeze both.
- **One availability exception per resource/day** is enforced by `(resource_id, date)`. Because an
  exception belongs to the resource, it affects every listing sharing that calendar.
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
