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
- **Legal & consent** — `LegalDocument` (one per `(tenant, doc_type)`; `current_version_id` is what the
  storefront serves, null = never published or withdrawn), `LegalDocumentVersion` (immutable once
  published; `published_at IS NULL` is the single draft, enforced by a **partial unique** index),
  `LegalDocumentTranslation` (`(version_id, locale)` — text hangs *below* the version because a version
  IS the agreement and `vi`/`en` are two renderings of it). `AgreementAcceptance` gains
  `document_version_id` (FK `ON DELETE RESTRICT` — evidence is never deleted out from under itself) and
  `accepted_locale` (the language actually rendered, fallback included). `tenants` gains
  `legal_ready_at` / `legal_documents_ready` / `legal_readiness_applied_at`, which drive the storefront
  hard gate. See [`features/legal-documents.md`](./features/legal-documents.md) and
  [ADR 0008](./decisions/0008-legal-documents-and-consent.md).
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
- **JSON blobs** (`Listing.modeConfig`, `ListingGroup.amenities`, booking
  `listingSnapshot`/`pricingSnapshot`/`commissionSnapshot`/`promotionSnapshot`/
  `cancellationPolicySnapshot`, `ListingType.searchConfig`, `Tenant.settings`,
  `SubscriptionPlan.limits`, `Payout.evidence`, `PricingRule.params`,
  `AvailabilityException.windows`) are typed & validated by `@booking/contracts`, not
  by the DB. `listingSnapshot` freezes the attributes together with their label/icon schema so a
  later listing-type edit cannot rewrite a historical booking display.
- **Calendar pricing** stays in `pricing_rules`: `date_range` covers exact daily overrides and
  `date_time_range` covers one local-date hourly window. Four things about it are load-bearing and
  none of them are visible in `schema.prisma` alone:
  - `price` is the rule's own regular unit price. `sale_price` is a partner-funded discount that is
    **only effective inside `[sale_starts_at, sale_ends_at)`**, judged at **booking** time (NULL on
    either side = unbounded). Outside that window the rule still applies **its own `price`** — not
    the listing's base price, because a campaign ending must not be indistinguishable from the rule
    having been deleted. `campaign_label` is the partner's name for the campaign, display only.
    Booking snapshots freeze the resulting numbers.
  - **One rule per scope**, enforced by a UNIQUE index `pricing_rules_scope_key` on
    `(listing_id, booking_mode, rule_type, params)`. This is what makes "saving a scope replaces it"
    true even under concurrent writes. Prisma cannot express `@@unique` over a `Json` column, so the
    index exists **only in the migration** `20260731130000_pricing_rule_scope_unique`; violations
    surface as P2002 and become `PRICING_RULE_SCOPE_TAKEN` (409).
  - Because that key contains `jsonb`, **`params` must be canonicalised before it is compared or
    written**. Postgres normalises jsonb key order on write, so a plain `JSON.stringify` of a
    freshly-built object will not match the stored row (this bug shipped once: replaces silently
    became inserts). `canonicalParams` in `listing/domain/entities/pricing-rule.entity.ts` is the
    only sanctioned comparison.
  - When two rules match the same instant, the higher `priority` wins (the quote kernel sorts
    descending). The band scale is `PRICING_RULE_PRIORITY` in `@booking/contracts` — 100 recurring
    (`day_of_week`, `time_range`), 500 `date_range`, 1000 `date_time_range`, so the narrowest scope
    wins. **It is a caller-side convention, not a DB or API rule**: the column accepts any integer
    and the create schema defaults it to `0`. The dashboard route actions and the seed are what
    apply the bands, and migration `20260731130000` re-banded the rows that predate the scale — a
    client posting a rule directly can still choose its own number. Collisions *within* a band are
    refused at write time rather than ranked, because a tie resolves by array order.
- **Public calendar-sale presentation is contract data, not stored state.** The pricing order remains
  unchanged: the winning rule supplies its regular `price`; an active `sale_price` replaces that
  unit price in the quote subtotal; only then can a checkout promotion reduce that subtotal. Public
  detailed availability exposes `regularPrice`, `price` and optional `campaignLabel` per slot/night.
  Quote lines expose `regularAmount`, `amount` and optional `campaignLabel`, plus aggregate
  `regularSubtotal` and `subtotal`. The optional `view=calendar` availability response projects each
  day to `{ date, status, sale }`, where `sale` is either `null` or the nested object
  `{ coverage, minDiscountPercent, maxDiscountPercent, campaignLabels }`; discovery payloads expose
  the descriptive `SaleCampaignSummary` rather than raw rules. These fields only explain existing
  computed prices. **No migration was added for this public visibility/presentation work.**
- **One availability exception per resource/day** is enforced by `(resource_id, date)`. Because an
  exception belongs to the resource, it affects every listing sharing that calendar. For a
  `custom_hours` exception the source of truth is `windows` (jsonb `[{ openTime, closeTime }]`), so
  one special day can open, break for lunch and reopen — exactly what the weekly schedule already
  allows. `open_time`/`close_time` are a mirror of `windows[0]`, rewritten on every save purely so
  readers predating the column keep working; never edit them directly.
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
