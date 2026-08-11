# Dynamic VAT Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every booking carry a frozen, date-correct Vietnamese VAT rate, and compute all
commission legs (tenant / platform / affiliate) on the **VAT-exclusive** base so a published 15%
take-rate is 15% of the seller's revenue, not 15% of revenue + state VAT.

**Architecture:** VAT is resolved from a **platform-owned, tenant-agnostic `tax_rates` table** keyed
by `(tax_category, effective window)`. The tenant never types a percentage — it only *classifies* a
listing type (`standard` / `reduced_5` / `exempt` / `not_taxable`) and declares each partner's tax
status. The resolved rate is frozen into the existing `commission_snapshot` at booking time, so a law
change is invisible to past bookings. `computeCommissionSplit` applies every rate to the net basis
while the partner keeps the **gross residual** — its VAT is its own to remit — which means **the
ledger journal shape and every existing balance invariant are unchanged**.

**Tech Stack:** NestJS 11 (hexagonal, no service classes), Prisma + hand-written SQL migrations,
PostgreSQL 16 with RLS, bigint VND money, TypeScript.

## Global Constraints

- **NO TESTS, ever** (AGENTS.md hard rule 1 / ADR 0005). Never create `*.spec.*` / `*.test.*`, test
  configs, or `test` scripts. Verification is `typecheck` + `lint` + `build` + `check:rls` + running
  the app. Every "verify" step below reflects this.
- Backend flow is **`controller → use-case → repository-port → repository`**. No service classes.
- **One use-case = one file**, exactly one exported `@Injectable XxxUseCase` with one public `execute()`.
- **Migrations are hand-authored** (ADR 0004) — never `prisma migrate dev`.
- Money is **`bigint` VND đồng**, never a float. Rates are integers. Time is `timestamptz` UTC.
- New tables need an explicit `GRANT` to `app_user, app_admin`.
- A table with a `tenant_id` column needs FORCE RLS + a `tenant_isolation` policy or
  `check:rls` fails. **`tax_rates` deliberately has no `tenant_id`** and therefore needs neither.
- Node ≥ 22.22.0 (`nvm use`), pnpm 10.13.1. Never npm/yarn.

## Decisions locked before implementation

These were settled in design discussion. Do not re-litigate them mid-task.

1. **Option B — commission on the net base.** Tenant, platform and affiliate rates all bite on the
   VAT-exclusive amount. The `platformRate + affiliateRate <= tenantRate` guard is untouched because
   all three still share one base.
2. **Prices are VAT-inclusive.** `listing.price`, `bookings.total_amount` and `final_amount` are
   redefined as **gross (VAT included)**. No stored number changes and no checkout code changes — this
   is a definition change only, safe because the product is not yet in operation.
3. **Agent model.** The partner is the seller of record; the tenant is a commission agent. This is
   already what the ledger does (`TONG-QUAN.md` §13.2 books tenant revenue as *net commission*, not
   gross booking value).
4. **VAT is resolved for the SERVICE date (`booking.start`), not the booking date.** A booking made
   2026-12-20 for a session on 2027-01-15 is a 10% booking. This is the whole point of the
   `effective_from`/`effective_to` window.

## Refinements discovered while planning (differ from the earlier verbal sketch)

- **No new ledger entry types.** Because the partner keeps the gross residual, cash still equals
  `partnerShare + platformFee + tenantNet` exactly. `vat_output` / `vat_withheld` belong to the
  deferred NĐ 117/2025 withholding work, not here. Not adding them keeps the immutable ledger
  untouched — a large risk reduction.
- **No `vat_amount` / `net_amount` columns on `booking_settlements`.** Both are derivable from the
  frozen snapshot plus the gross amount, so storing them is denormalisation with a drift risk (YAGNI).
  Revisit when e-invoicing is built.
- **`tenants.tax_status` added** (not in the original list). Without it a house partner — where the
  *tenant* is the seller — could not be classified, and its platform fee would be computed on gross
  while every other partner's is on net. One column closes that inconsistency.

## File Structure

| File | Responsibility |
| --- | --- |
| `apps/api/prisma/schema.prisma` | *Modify.* `TaxRate` model, `TaxCategory` + `PartnerTaxStatus` enums, `ListingType.taxCategory`, `Partner.taxStatus`, `Tenant.taxStatus`. |
| `apps/api/prisma/migrations/20260811120000_vat_tax_rates/migration.sql` | *Create.* DDL + `GRANT`. No data. |
| `apps/api/src/shared/money/money.ts` | *Modify.* `vatFromGross()` + `netOfVat()`, beside `percentOfBps`. |
| `apps/api/src/shared/domain/tax/tax.ts` | *Create.* Pure, framework-free: category/status types, `partnerChargesVat`, `TaxRateCandidate`, `selectTaxRate`, `TaxSnapshot`. |
| `apps/api/src/shared/domain/commission/commission-snapshot.ts` | *Modify.* Carry `tax?: TaxSnapshot`; surface `vatBps` through `snapshotToRates`. |
| `apps/api/src/shared/domain/commission/commission-split.ts` | *Modify.* Apply rates to the net basis; partner keeps the gross residual. |
| `apps/api/src/modules/finance/domain/ports/tax-rate-repository.port.ts` | *Create.* Port + DI token. |
| `apps/api/src/modules/finance/infrastructure/repositories/prisma-tax-rate.repository.ts` | *Create.* Reads the global table. |
| `apps/api/src/modules/finance/application/use-cases/resolve-commission.use-case.ts` | *Modify.* Resolve + freeze the tax snapshot alongside the commission rule. |
| `apps/api/src/modules/finance/infrastructure/http/finance.module.ts` | *Modify.* Provide the new repository. |
| `apps/api/src/modules/booking/application/use-cases/create-booking.use-case.ts` | *Modify.* Pass `tenantId` + `serviceDate` into the resolver. |
| `apps/api/prisma/seed/tax-rates.ts` | *Create.* The VN VAT schedule — every scope, incl. production. |
| `apps/api/prisma/seed.ts` | *Modify.* Call the new seeder. |
| `apps/api/prisma/seed/demo/{studio,sport}-demo.ts` | *Modify.* Give demo partners differing tax statuses. |

Pure maths lives in `shared/`; DB reads live in the finance module. The booking module gains no new
dependency — it already injects `ResolveCommissionUseCase`, so `pnpm check:module-cycles` stays green.

---

### Task 1: Tax schema + migration

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/20260811120000_vat_tax_rates/migration.sql`

**Interfaces:**
- Consumes: nothing.
- Produces: table `tax_rates`; enums `tax_category`, `partner_tax_status`; columns
  `listing_types.tax_category`, `partners.tax_status`, `tenants.tax_status`. Prisma model `TaxRate`
  with fields `id, category, rateBps, effectiveFrom, effectiveTo, legalRef`.

- [ ] **Step 1: Add the enums to `schema.prisma`**

Place beside the other enums (near `PartnerType`, line ~91):

```prisma
/// VAT treatment of a listing type. The tenant picks the CATEGORY; the platform
/// owns the rate that category maps to at a given date (`tax_rates`).
enum TaxCategory {
  standard
  reduced_5
  exempt
  not_taxable

  @@map("tax_category")
}

/// Whether a seller charges output VAT. `household_below_threshold` is the
/// effective annual-revenue exemption (1B VND from 2026 under NĐ 141/2026/NĐ-CP); `individual` is a
/// non-business person. Both resolve to a 0% rate.
enum PartnerTaxStatus {
  company_vat
  household_declaring
  household_below_threshold
  individual

  @@map("partner_tax_status")
}
```

- [ ] **Step 2: Add the `TaxRate` model to `schema.prisma`**

Place it near `SubscriptionPlan` (line ~849) with the other global, non-tenant-scoped models:

```prisma
/// Platform-owned Vietnamese VAT schedule. GLOBAL reference data — deliberately
/// no `tenant_id`, no RLS: the rate is national law, identical for every tenant,
/// and a law change must be one row edit rather than a fan-out across tenants.
/// At most one row may cover a given (category, instant).
model TaxRate {
  id            String      @id @default(uuid(7)) @db.Uuid
  category      TaxCategory
  /// VAT in basis points — 800 = 8%, 1000 = 10%. Matches `percentOfBps`.
  rateBps       Int         @map("rate_bps")
  effectiveFrom DateTime    @map("effective_from") @db.Timestamptz(6)
  /// Exclusive upper bound; null = still in force.
  effectiveTo   DateTime?   @map("effective_to") @db.Timestamptz(6)
  /// The instrument this rate comes from, e.g. 'NQ 204/2025/QH15'.
  legalRef      String      @map("legal_ref")
  createdAt     DateTime    @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt     DateTime    @updatedAt @map("updated_at") @db.Timestamptz(6)

  @@unique([category, effectiveFrom])
  @@index([category, effectiveFrom])
  @@map("tax_rates")
}
```

- [ ] **Step 3: Add the three classification columns to `schema.prisma`**

In `model ListingType` (line ~957), after `requiresIdentityVerification`:

```prisma
  /// VAT treatment of everything sold under this type (§VAT). The tenant sets the
  /// category; the platform owns the rate it maps to.
  taxCategory                  TaxCategory      @default(standard) @map("tax_category")
```

In `model Partner` (line ~886), after `businessInfo`:

```prisma
  /// Whether this partner charges output VAT. Defaults to the 0%-VAT status so
  /// enabling the feature can never silently move money on existing rows.
  taxStatus                   PartnerTaxStatus          @default(household_below_threshold) @map("tax_status")
```

In `model Tenant`, after the subscription/theme settings fields:

```prisma
  /// The tenant's own VAT status — governs a HOUSE partner's booking, where the
  /// tenant is the seller of record rather than an agent.
  taxStatus            PartnerTaxStatus @default(company_vat) @map("tax_status")
```

- [ ] **Step 4: Write the migration**

Create `apps/api/prisma/migrations/20260811120000_vat_tax_rates/migration.sql`:

```sql
-- Dynamic VAT (§VAT). Three moving parts:
--   1. `tax_rates` — the national VAT schedule. GLOBAL on purpose: no tenant_id,
--      therefore no RLS policy and none required by check:rls. The 2% reduction
--      (NQ 204/2025/QH15) lapsing on 2026-12-31 must be one row edit, not a
--      fan-out across every tenant's rows.
--   2. `listing_types.tax_category` — the tenant classifies WHAT it sells.
--   3. `partners.tax_status` / `tenants.tax_status` — WHO sells decides whether
--      output VAT applies at all (households under the effective annual threshold are exempt).

CREATE TYPE "tax_category" AS ENUM (
  'standard',
  'reduced_5',
  'exempt',
  'not_taxable'
);

CREATE TYPE "partner_tax_status" AS ENUM (
  'company_vat',
  'household_declaring',
  'household_below_threshold',
  'individual'
);

CREATE TABLE "tax_rates" (
  "id" UUID NOT NULL,
  "category" "tax_category" NOT NULL,
  "rate_bps" INTEGER NOT NULL,
  "effective_from" TIMESTAMPTZ(6) NOT NULL,
  "effective_to" TIMESTAMPTZ(6),
  "legal_ref" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "tax_rates_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "tax_rates_category_effective_from_key" UNIQUE ("category", "effective_from"),
  CONSTRAINT "tax_rates_rate_bps_range_check" CHECK ("rate_bps" >= 0 AND "rate_bps" <= 10000),
  CONSTRAINT "tax_rates_effective_window_check"
    CHECK ("effective_to" IS NULL OR "effective_to" > "effective_from")
);

CREATE INDEX "tax_rates_category_effective_from_idx"
  ON "tax_rates" ("category", "effective_from");

-- Reference data the app only ever reads; writes go through the migrate/seed
-- connection, which bypasses these grants.
GRANT SELECT ON "tax_rates" TO app_user, app_admin;

ALTER TABLE "listing_types"
  ADD COLUMN "tax_category" "tax_category" NOT NULL DEFAULT 'standard';

-- Defaults chosen so that turning the feature on moves no money: a partner is
-- assumed VAT-exempt until a tenant says otherwise, while a tenant (which pays
-- for a subscription and invoices commission) is assumed to be a VAT company.
ALTER TABLE "partners"
  ADD COLUMN "tax_status" "partner_tax_status" NOT NULL DEFAULT 'household_below_threshold';

ALTER TABLE "tenants"
  ADD COLUMN "tax_status" "partner_tax_status" NOT NULL DEFAULT 'company_vat';
```

- [ ] **Step 5: Apply and verify**

```bash
cd "/Volumes/OVEN Duy/temp/single-test"
nvm use
docker compose up -d
pnpm --filter=@booking/api prisma:deploy
pnpm --filter=@booking/api prisma:generate
pnpm --filter=@booking/api check:rls
```

Expected: migration applies clean; `check:rls: OK — N tenant-scoped tables all have FORCE RLS +
policy` with **N unchanged from before this task** (`tax_rates` must NOT appear — it has no
`tenant_id`). If `tax_rates` is listed as an offender, the model wrongly grew a `tenant_id`.

- [ ] **Step 6: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/20260811120000_vat_tax_rates
git commit -m "feat(api): add tax_rates schedule and VAT classification columns"
```

---

### Task 2: `vatFromGross()` money helper

**Files:**
- Modify: `apps/api/src/shared/money/money.ts`

**Interfaces:**
- Consumes: `Vnd`, existing rounding conventions.
- Produces: `vatFromGross(gross: Vnd, bps: number): Vnd` and `netOfVat(gross: Vnd, bps: number): Vnd`.

- [ ] **Step 1: Append both helpers after `percentOfBps`**

```ts
/**
 * The VAT *contained in* a VAT-INCLUSIVE amount: `gross × bps / (10000 + bps)`,
 * half-up.
 *
 * This is NOT `percentOfBps(gross, bps)` — that computes the VAT to ADD to a net
 * price. Storefront prices are gross (§VAT: giá niêm yết đã gồm thuế), so using
 * the wrong one overstates VAT by ~8% of the whole booking. Always take the net
 * with {@link netOfVat} rather than rounding a second time, so the two legs
 * re-sum to the exact gross and the ledger cannot drift by a đồng.
 */
export function vatFromGross(gross: Vnd, bps: number): Vnd {
  if (!Number.isSafeInteger(bps) || bps < 0) {
    throw new TypeError(`bps must be a non-negative integer, got ${bps}`);
  }
  if (bps === 0 || gross <= 0n) return 0n;
  const denominator = 10_000n + BigInt(bps);
  // round(x/y) half-up === floor((2x + y) / 2y) for positive integers.
  return (gross * BigInt(bps) * 2n + denominator) / (denominator * 2n);
}

/** The VAT-exclusive part of a gross amount. `netOfVat(g,b) + vatFromGross(g,b) === g`. */
export function netOfVat(gross: Vnd, bps: number): Vnd {
  return gross - vatFromGross(gross, bps);
}
```

- [ ] **Step 2: Verify it typechecks**

```bash
pnpm --filter=@booking/api typecheck
```

Expected: no errors.

- [ ] **Step 3: Sanity-check the arithmetic by hand (no test file — ADR 0005)**

```bash
node -e '
const f=(g,b)=>{const d=10000n+BigInt(b);return (g*BigInt(b)*2n+d)/(d*2n)};
const g=2000000n, bps=800;
const vat=f(g,bps), net=g-vat;
console.log({vat, net, resum: net+vat===g});
'
```

Expected exactly: `{ vat: 148148n, net: 1851852n, resum: true }`.
If `vat` comes out `160000n` the additive formula was used — wrong.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/shared/money/money.ts
git commit -m "feat(api): add vatFromGross/netOfVat inclusive-VAT helpers"
```

---

### Task 3: Pure tax domain (categories, statuses, rate selection)

**Files:**
- Create: `apps/api/src/shared/domain/tax/tax.ts`

**Interfaces:**
- Consumes: nothing (pure).
- Produces: `TaxCategory`, `PartnerTaxStatus`, `partnerChargesVat(status)`, `TaxRateCandidate`,
  `selectTaxRate(rates, category, at)`, `TaxSnapshot`, `noTax(resolvedFor: Date): TaxSnapshot`.

- [ ] **Step 1: Create the file**

```ts
/**
 * Pure VAT domain (§VAT). No framework, no Prisma — mirrors the split between
 * `commission-rule-precedence.ts` (selection) and `commission-snapshot.ts`
 * (what gets frozen), so both halves of the money maths read the same way.
 *
 * Division of ownership: the PLATFORM owns the rate a category maps to (national
 * law, `tax_rates`); the TENANT owns only the classification of what it sells.
 * A tenant can never type a percentage.
 */

/** Structurally identical to Prisma's generated `TaxCategory` enum. */
export type TaxCategory = 'standard' | 'reduced_5' | 'exempt' | 'not_taxable';

/** Structurally identical to Prisma's generated `PartnerTaxStatus` enum. */
export type PartnerTaxStatus =
  | 'company_vat'
  | 'household_declaring'
  | 'household_below_threshold'
  | 'individual';

/**
 * Only a VAT-registered company or a declaring household charges output VAT.
 * A household under the effective annual threshold and a
 * non-business individual both resolve to 0% regardless of listing type.
 */
export function partnerChargesVat(status: PartnerTaxStatus): boolean {
  return status === 'company_vat' || status === 'household_declaring';
}

/** One row of the national schedule, as the repository supplies it. */
export interface TaxRateCandidate {
  id: string;
  category: TaxCategory;
  /** Basis points — 800 = 8%. */
  rateBps: number;
  effectiveFrom: Date;
  /** Exclusive upper bound; null = still in force. */
  effectiveTo: Date | null;
  legalRef: string;
}

/**
 * The rate in force for `category` at `at`.
 *
 * Unlike commission rules there is no specificity ladder — the schedule is
 * national law, so time is the only axis. `at` must be the SERVICE date, not the
 * booking date: VAT on a service is fixed when the service is delivered, so a
 * 2026-12-20 booking for a 2027-01-15 session is a 10% booking.
 *
 * Ties (which the (category, effective_from) unique constraint already prevents)
 * break toward the later window.
 */
export function selectTaxRate(
  rates: TaxRateCandidate[],
  category: TaxCategory,
  at: Date,
): TaxRateCandidate | null {
  const applicable = rates.filter(
    (r) =>
      r.category === category &&
      at >= r.effectiveFrom &&
      (r.effectiveTo === null || at < r.effectiveTo),
  );
  if (applicable.length === 0) return null;
  return applicable.reduce((best, r) => (r.effectiveFrom > best.effectiveFrom ? r : best));
}

/**
 * The immutable VAT context frozen onto a booking. Replaying this — never the
 * live table — is what makes an invoice issued in 2027 for a 2026 booking still
 * print 8%.
 */
export interface TaxSnapshot {
  taxRateId: string | null;
  category: TaxCategory | null;
  /** 0 = no VAT applies to this booking (exempt seller, exempt service, or no rate row). */
  vatBps: number;
  legalRef: string | null;
  /** ISO service date the rate was resolved for — NOT the booking creation date. */
  resolvedFor: string;
}

/** The no-VAT snapshot: exempt seller, exempt service, or no matching rate row. */
export function noTax(resolvedFor: Date): TaxSnapshot {
  return {
    taxRateId: null,
    category: null,
    vatBps: 0,
    legalRef: null,
    resolvedFor: resolvedFor.toISOString(),
  };
}
```

- [ ] **Step 2: Verify**

```bash
pnpm --filter=@booking/api typecheck && pnpm --filter=@booking/api lint
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/shared/domain/tax/tax.ts
git commit -m "feat(api): add pure VAT domain — categories, statuses, rate selection"
```

---

### Task 4: Freeze tax into the commission snapshot

**Files:**
- Modify: `apps/api/src/shared/domain/commission/commission-snapshot.ts`

**Interfaces:**
- Consumes: `TaxSnapshot`, `noTax` (Task 3).
- Produces: `CommissionSnapshot.tax?: TaxSnapshot`; `snapshotToRates()` now returns
  `CommissionRates` including `vatBps: number`.

**Why here and not a separate `tax_snapshot` column:** every replay path
(`booking-finance-view.ts`, `settlement.entity.ts`, `create-booking.use-case.ts`) already threads
exactly one snapshot object. A second column would need parallel plumbing in all three and could go
null-vs-present out of sync with the commission half — a class of bug that cannot happen if the two
travel together. `tax` is **optional** so a booking written before this feature parses unchanged.

- [ ] **Step 1: Add the import at the top of the file**

```ts
import { noTax, type TaxSnapshot } from '../tax/tax';
```

- [ ] **Step 2: Add the field to `CommissionSnapshot`**

Append inside the interface, after `isHouse: boolean;`:

```ts
  /**
   * Frozen VAT context (§VAT). Optional: a booking created before dynamic VAT has
   * none, and must keep behaving exactly as it did — `snapshotToRates` reads it
   * as `vatBps: 0`, which makes every rate fall back to the gross base.
   */
  tax?: TaxSnapshot;
```

- [ ] **Step 3: Set it in `defaultCommissionSnapshot`**

Change the signature and the returned object:

```ts
/** A safe zero-commission snapshot (partner keeps everything) when no rule matches. */
export function defaultCommissionSnapshot(isHouse: boolean, at: Date = new Date()): CommissionSnapshot {
  return {
    ruleId: null,
    appliesTo: 'none',
    tenantRateType: 'percent',
    tenantRate: '0',
    platformRate: 0,
    affiliateRateType: 'percent',
    affiliateRate: '0',
    isHouse,
    tax: noTax(at),
  };
}
```

The `at` default keeps both existing call sites (`resolve-commission.use-case.ts:44`,
`booking-finance-view.ts:48`) compiling untouched.

- [ ] **Step 4: Surface `vatBps` in `snapshotToRates`**

Append one line to the returned object:

```ts
    isHouse: snapshot.isHouse,
    vatBps: snapshot.tax?.vatBps ?? 0,
```

- [ ] **Step 5: Verify**

```bash
pnpm --filter=@booking/api typecheck
```

Expected: **one** error in `commission-split.ts` — `vatBps` does not exist on type
`CommissionRates`. That is the correct hand-off into Task 5; do not fix it here.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/shared/domain/commission/commission-snapshot.ts
git commit -m "feat(api): freeze the resolved VAT context into the commission snapshot"
```

---

### Task 5: Apply commission rates to the net base (Option B)

**Files:**
- Modify: `apps/api/src/shared/domain/commission/commission-split.ts`

**Interfaces:**
- Consumes: `netOfVat` (Task 2), `CommissionRates.vatBps` (Task 4).
- Produces: unchanged `CommissionSplit` shape — `partnerShare`, `platformFee`,
  `affiliateCommission`, `tenantNet`, `promoDiscount`, `fundedBy`, `flags`.

**The invariant this must preserve:** `finalAmount === partnerShare + platformFee +
affiliateCommission + tenantNet + promoDiscount`. Rates move to the net base, but the partner keeps
the **gross residual**, so the cash still reconciles and no ledger change is needed.

- [ ] **Step 1: Import `netOfVat`**

Change the first line of the file:

```ts
import { netOfVat, percentOfBps, type Vnd } from '../../money/money';
```

- [ ] **Step 2: Add `vatBps` to `CommissionRates`**

Append inside the interface, after `isHouse`:

```ts
  /**
   * VAT contained in the gross amounts, in basis points (800 = 8%); 0 = no VAT.
   * Every rate below bites on the amount NET of this (§VAT option B), so a
   * published 15% take-rate is 15% of the seller's revenue rather than 15% of
   * revenue + state VAT.
   */
  vatBps: number;
```

- [ ] **Step 3: Derive the net bases at the top of `computeCommissionSplit`**

Immediately after the `promoDiscount` line:

```ts
  // §VAT option B — rates apply to the VAT-EXCLUSIVE base. The partner keeps the
  // GROSS residual because, under the agent model, the VAT inside its share is
  // its own to remit. Cash therefore still reconciles and the ledger journal in
  // `ledger-journal.entity.ts` is untouched.
  const netFinal = netOfVat(finalAmount, rates.vatBps);
  const netTotal = netOfVat(totalAmount, rates.vatBps);
```

- [ ] **Step 4: Move the platform and affiliate legs onto `netFinal`**

Replace the two existing lines:

```ts
  // Platform + affiliate ALWAYS bite on final_amount — net of VAT (§VAT).
  const platformFee = pct(netFinal, rates.platformRate);
  const affiliateCommission = hasAffiliate
    ? applyRate(rates.affiliateRateType, rates.affiliateRate, netFinal)
    : 0n;
```

- [ ] **Step 5: Leave the house-partner branch on the gross take**

Replace the comment above the house-partner `tenantNet` so the asymmetry is explained rather than
looking like an oversight. The expression itself does not change:

```ts
  if (rates.isHouse) {
    // No partner leg; the tenant sells its own inventory and keeps the remainder.
    // The take stays GROSS: the tenant is the seller here, so the VAT inside it is
    // the tenant's own liability and must not leak out of the journal.
    const tenantNet = finalAmount - platformFee - affiliateCommission;
```

- [ ] **Step 6: Split the partner basis into gross and net**

Replace the `partnerBasis` / `tenantCommission` block:

```ts
  // Gross basis pays the partner; net basis sizes the tenant's commission.
  const partnerBasis = fundedBy === 'tenant' ? totalAmount : finalAmount;
  const netPartnerBasis = fundedBy === 'tenant' ? netTotal : netFinal;
  // Compute the raw (uncapped) tenant commission so the partner-share floor below
  // detects — and flags — a fixed fee that exceeds the booking value (§13.1).
  let tenantCommission =
    rates.tenantRateType === 'percent'
      ? pct(netPartnerBasis, Number(rates.tenantRate))
      : rates.tenantRate;
```

Everything below (`partnerShare = partnerBasis - tenantCommission`, the floor, `tenantNet`) is
unchanged — `partnerShare` stays a gross residual, which is exactly what Option B requires.

- [ ] **Step 7: Verify the whole API typechecks and the arithmetic is right**

```bash
pnpm --filter=@booking/api typecheck && pnpm --filter=@booking/api lint
```

Expected: no errors (Task 4's deliberate error is now resolved).

Then confirm the worked example end-to-end. Expected for a 2,000,000 đ booking at 8% VAT, tenant 15%,
platform 2%, no promo, no affiliate:

| Leg | Value |
| --- | --- |
| VAT contained | 148,148 |
| net final | 1,851,852 |
| tenant commission (15% of net) | 277,778 |
| platform fee (2% of net) | 37,037 |
| partner share (gross residual) | 1,722,222 |
| tenant net | 240,741 |
| **partner + platform + tenantNet** | **2,000,000** ✅ |

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/shared/domain/commission/commission-split.ts
git commit -m "feat(api): compute commission legs on the VAT-exclusive base"
```

---

### Task 6: Resolve and freeze the rate at booking time

**Files:**
- Create: `apps/api/src/modules/finance/domain/ports/tax-rate-repository.port.ts`
- Create: `apps/api/src/modules/finance/infrastructure/repositories/prisma-tax-rate.repository.ts`
- Modify: `apps/api/src/modules/finance/application/use-cases/resolve-commission.use-case.ts`
- Modify: `apps/api/src/modules/finance/infrastructure/http/finance.module.ts`
- Modify: `apps/api/src/modules/booking/application/use-cases/create-booking.use-case.ts`

**Interfaces:**
- Consumes: `selectTaxRate`, `partnerChargesVat`, `noTax`, `TaxSnapshot`, `TaxRateCandidate` (Task 3);
  `CommissionSnapshot.tax` (Task 4).
- Produces: `TAX_RATE_REPOSITORY` token + `ITaxRateRepository`; `ResolveCommissionTarget` gains
  `tenantId: string` and `serviceDate: Date`.

- [ ] **Step 1: Create the port**

```ts
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import type { TaxRateCandidate } from '../../../../shared/domain/tax/tax';

export const TAX_RATE_REPOSITORY = Symbol('TAX_RATE_REPOSITORY');

export interface ITaxRateRepository {
  /** The whole schedule — a handful of rows; selection is pure and in-memory. */
  list(tx: PrismaTx): Promise<TaxRateCandidate[]>;
}
```

- [ ] **Step 2: Create the Prisma repository**

```ts
import { Injectable } from '@nestjs/common';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import type { TaxRateCandidate } from '../../../../shared/domain/tax/tax';
import type { ITaxRateRepository } from '../../domain/ports/tax-rate-repository.port';

/**
 * `tax_rates` is global reference data — no tenant_id, no RLS — so this reads the
 * same handful of rows for every tenant. It still takes the caller's `tx` so the
 * resolved rate commits atomically with the booking that froze it.
 */
@Injectable()
export class PrismaTaxRateRepository implements ITaxRateRepository {
  async list(tx: PrismaTx): Promise<TaxRateCandidate[]> {
    const rows = await tx.taxRate.findMany({
      select: {
        id: true,
        category: true,
        rateBps: true,
        effectiveFrom: true,
        effectiveTo: true,
        legalRef: true,
      },
    });
    return rows.map((r) => ({
      id: r.id,
      category: r.category,
      rateBps: r.rateBps,
      effectiveFrom: r.effectiveFrom,
      effectiveTo: r.effectiveTo,
      legalRef: r.legalRef,
    }));
  }
}
```

- [ ] **Step 3: Extend `ResolveCommissionTarget`**

In `resolve-commission.use-case.ts`, replace the interface:

```ts
export interface ResolveCommissionTarget {
  tenantId: string;
  partnerId: string;
  listingTypeId: string | null;
  categoryId: string | null;
  isHouse: boolean;
  /**
   * Booking start. VAT on a service is fixed by the date the service is
   * DELIVERED, so a 2026-12-20 booking for a 2027-01-15 session is a 10%
   * booking. Never pass `now` here.
   */
  serviceDate: Date;
}
```

- [ ] **Step 4: Add the imports and inject the repository**

```ts
import {
  noTax,
  partnerChargesVat,
  selectTaxRate,
  type TaxSnapshot,
} from '../../../../shared/domain/tax/tax';
import {
  TAX_RATE_REPOSITORY,
  type ITaxRateRepository,
} from '../../domain/ports/tax-rate-repository.port';
```

Add to the constructor:

```ts
    @Inject(TAX_RATE_REPOSITORY) private readonly taxRates: ITaxRateRepository,
```

- [ ] **Step 5: Resolve the tax snapshot inside `execute`**

Replace the body after `selectCommissionRule(...)`:

```ts
    const tax = await this.resolveTax(tx, target);
    if (!rule) return { ...defaultCommissionSnapshot(target.isHouse, target.serviceDate), tax };
    return {
      ruleId: rule.id,
      appliesTo: rule.appliesTo,
      tenantRateType: rule.tenantRateType,
      tenantRate: rule.tenantRate.toString(),
      platformRate: rule.platformRate,
      affiliateRateType: rule.affiliateRateType,
      affiliateRate: rule.affiliateRate.toString(),
      isHouse: target.isHouse,
      tax,
    };
  }

  /**
   * Two gates before a rate even matters: WHO sells (an exempt household charges
   * no VAT whatever it sells) and WHAT is sold (the listing type's category).
   * A house partner is sold by the TENANT, so the tenant's own status governs.
   * Any miss falls back to 0% — the pre-VAT behaviour — rather than guessing.
   */
  private async resolveTax(tx: PrismaTx, target: ResolveCommissionTarget): Promise<TaxSnapshot> {
    const none = noTax(target.serviceDate);
    if (!target.listingTypeId) return none;

    const sellerStatus = target.isHouse
      ? (await tx.tenant.findUnique({ where: { id: target.tenantId }, select: { taxStatus: true } }))
          ?.taxStatus
      : (
          await tx.partner.findUnique({
            where: { id: target.partnerId },
            select: { taxStatus: true },
          })
        )?.taxStatus;
    if (!sellerStatus || !partnerChargesVat(sellerStatus)) return none;

    const listingType = await tx.listingType.findUnique({
      where: { id: target.listingTypeId },
      select: { taxCategory: true },
    });
    if (!listingType) return none;

    const rate = selectTaxRate(
      await this.taxRates.list(tx),
      listingType.taxCategory,
      target.serviceDate,
    );
    if (!rate) return none;

    return {
      taxRateId: rate.id,
      category: rate.category,
      vatBps: rate.rateBps,
      legalRef: rate.legalRef,
      resolvedFor: target.serviceDate.toISOString(),
    };
  }
```

Reading `tx.partner` / `tx.listingType` / `tx.tenant` directly from a finance use-case follows the
established pattern in this module — `booking-finance-view.ts:47` already reads `tx.partner` the same
way. It is a read of another module's table, not a reach into its `infrastructure/`, so
`check:module-cycles` is unaffected.

- [ ] **Step 6: Register the repository in `finance.module.ts`**

Add the import:

```ts
import { PrismaTaxRateRepository } from '../repositories/prisma-tax-rate.repository';
import { TAX_RATE_REPOSITORY } from '../../domain/ports/tax-rate-repository.port';
```

Add to `providers`, beside the other repository bindings:

```ts
    { provide: TAX_RATE_REPOSITORY, useClass: PrismaTaxRateRepository },
```

- [ ] **Step 7: Pass the new fields from `create-booking.use-case.ts`**

At line ~309, replace the resolver call:

```ts
    let commissionSnapshot = await this.commissions.execute(tx, {
      tenantId,
      partnerId: args.listing.partnerId,
      listingTypeId: args.listing.listingTypeId,
      categoryId: args.listing.categoryId,
      isHouse,
      serviceDate: args.timeslot.start,
    });
```

- [ ] **Step 8: Verify**

```bash
pnpm --filter=@booking/api typecheck && pnpm --filter=@booking/api lint
pnpm check:module-cycles
```

Expected: all clean.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/modules/finance apps/api/src/modules/booking
git commit -m "feat(api): resolve and freeze the service-date VAT rate at booking time"
```

---

### Task 7: Seed the VAT schedule and demo tax statuses

**Files:**
- Create: `apps/api/prisma/seed/tax-rates.ts`
- Modify: `apps/api/prisma/seed.ts`
- Modify: `apps/api/prisma/seed/demo/studio-demo.ts`
- Modify: `apps/api/prisma/seed/demo/sport-demo.ts`

**Interfaces:**
- Consumes: the `tax_rates` table and `partners.tax_status` (Task 1).
- Produces: `seedTaxRates(prisma: PrismaClient): Promise<void>`.

- [ ] **Step 1: Create `apps/api/prisma/seed/tax-rates.ts`**

```ts
import type { PrismaClient } from '@prisma/client';

/**
 * The Vietnamese VAT schedule. These are legal constants, not demo data, so this
 * runs in EVERY scope including production — same rule as the permission
 * catalogue in `platform.ts`.
 *
 * The 10% row is seeded ALREADY, opening the instant the 2% reduction
 * (NQ 204/2025/QH15) lapses. The 2027-01-01 changeover therefore needs no deploy,
 * no migration and no human: `selectTaxRate` simply starts matching the next row.
 *
 * Times are +07:00 (Asia/Ho_Chi_Minh) because a tax period is a Vietnamese
 * calendar date, not a UTC one — 2027-01-01T00:00+07 is 2026-12-31T17:00Z.
 */
const VAT_SCHEDULE = [
  {
    category: 'standard',
    rateBps: 800,
    effectiveFrom: '2025-07-01T00:00:00+07:00',
    effectiveTo: '2027-01-01T00:00:00+07:00',
    legalRef: 'NQ 204/2025/QH15',
  },
  {
    category: 'standard',
    rateBps: 1000,
    effectiveFrom: '2027-01-01T00:00:00+07:00',
    effectiveTo: null,
    legalRef: 'Luật 48/2024/QH15',
  },
  {
    category: 'reduced_5',
    rateBps: 500,
    effectiveFrom: '2025-07-01T00:00:00+07:00',
    effectiveTo: null,
    legalRef: 'Luật 48/2024/QH15 Đ.9',
  },
  {
    category: 'exempt',
    rateBps: 0,
    effectiveFrom: '2025-07-01T00:00:00+07:00',
    effectiveTo: null,
    legalRef: 'Luật 48/2024/QH15 Đ.5',
  },
  {
    category: 'not_taxable',
    rateBps: 0,
    effectiveFrom: '2025-07-01T00:00:00+07:00',
    effectiveTo: null,
    legalRef: 'Luật 48/2024/QH15 Đ.5',
  },
] as const;

/** Idempotent on the (category, effective_from) unique key. */
export async function seedTaxRates(prisma: PrismaClient): Promise<void> {
  for (const row of VAT_SCHEDULE) {
    const data = {
      rateBps: row.rateBps,
      effectiveTo: row.effectiveTo ? new Date(row.effectiveTo) : null,
      legalRef: row.legalRef,
    };
    await prisma.taxRate.upsert({
      where: {
        category_effectiveFrom: {
          category: row.category,
          effectiveFrom: new Date(row.effectiveFrom),
        },
      },
      update: data,
      create: {
        category: row.category,
        effectiveFrom: new Date(row.effectiveFrom),
        ...data,
      },
    });
  }
}
```

- [ ] **Step 2: Wire it into `seed.ts`**

Add the import beside `seedAdministrativeDivisions`:

```ts
import { seedTaxRates } from './seed/tax-rates';
```

Call it in `main()` immediately after `seedAdministrativeDivisions(prisma)` — both are national
reference data required in every scope:

```ts
  await seedAdministrativeDivisions(prisma);
  await seedTaxRates(prisma);
```

- [ ] **Step 3: Give the demo partners differing tax statuses**

The point is that both branches — VAT charged and VAT exempt — are exercised by seeded data, so the
0% path is visible in the running app rather than only in theory.

In `apps/api/prisma/seed/demo/studio-demo.ts`, add `taxStatus` to the **`create`** block of each
partner upsert:

- `slug: 'giang-studio'` (line ~62, `partnerType: 'company'`, has `taxId`) → `taxStatus: 'company_vat',`
- `slug: 'trang-makeup'` (line ~153, `partnerType: 'individual'`) → `taxStatus: 'household_below_threshold',`
- `slug: 'bookingstudio-house'` (line ~187, house partner) → `taxStatus: 'company_vat',`

In `apps/api/prisma/seed/demo/sport-demo.ts`:

- `slug: 'hoang-gia-sport'` (`partnerType: 'company'`, has `taxId`) → `taxStatus: 'company_vat',`

Listing types keep the `standard` default from the migration — every studio and court service is
standard-rated, so no catalog change is needed.

- [ ] **Step 4: Reseed and verify the data landed**

```bash
pnpm --filter=@booking/api exec prisma migrate reset --force
pnpm --filter=@booking/api prisma:deploy
pnpm --filter=@booking/api seed
```

Then confirm:

```bash
docker compose exec -T postgres psql -U postgres -d bookingos -c \
  "SELECT category, rate_bps, effective_from, effective_to, legal_ref FROM tax_rates ORDER BY category, effective_from;"
docker compose exec -T postgres psql -U postgres -d bookingos -c \
  "SELECT slug, partner_type, tax_status FROM partners ORDER BY slug;"
```

Expected: 5 tax-rate rows with the two `standard` windows meeting exactly at `2026-12-31 17:00:00+00`
(= 2027-01-01 +07); `trang-makeup` shows `household_below_threshold` and the rest `company_vat`.

If the psql database name differs, read it from `DATABASE_URL` in the root `.env`.

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma/seed.ts apps/api/prisma/seed/tax-rates.ts apps/api/prisma/seed/demo
git commit -m "feat(api): seed the VN VAT schedule and demo partner tax statuses"
```

---

### Task 8: Full verification pass

**Files:** none — this task only runs checks and the app.

**Interfaces:**
- Consumes: everything above.
- Produces: a green static check and one hand-verified booking.

- [ ] **Step 1: Run the full static check**

```bash
cd "/Volumes/OVEN Duy/temp/single-test"
nvm use
pnpm check:no-tests && pnpm check:module-cycles && pnpm check:frontend-structure \
  && pnpm --filter=@booking/storefront security \
  && pnpm turbo lint typecheck build \
  && pnpm --filter=@booking/api check:rls
```

Expected: every gate passes. `check:no-tests` in particular must stay green — this plan adds no test
files by design.

- [ ] **Step 2: Run the app and make a real booking**

```bash
docker compose up -d
pnpm dev
```

Book a listing on `http://bookingstudio.localhost:5173` belonging to **Giang Studio**
(`company_vat`, so VAT applies).

- [ ] **Step 3: Verify the frozen snapshot on that booking**

```bash
docker compose exec -T postgres psql -U postgres -d bookingos -c \
  "SELECT code, final_amount, commission_snapshot->'tax' AS tax FROM bookings ORDER BY created_at DESC LIMIT 1;"
```

Expected: the `tax` object is present with `vatBps: 800`, `category: \"standard\"`,
`legalRef: \"NQ 204/2025/QH15\"`, a non-null `taxRateId`, and `resolvedFor` equal to the **booking's
slot start**, not the time you clicked Book.

- [ ] **Step 4: Verify the split reconciles**

Take the booking through to a released settlement (dashboard → tenant → bookings → complete, then
release after the dispute window), then:

```bash
docker compose exec -T postgres psql -U postgres -d bookingos -c \
  "SELECT online_held_amount, partner_gross_earning, platform_fee, tenant_net_earning, affiliate_commission FROM booking_settlements ORDER BY created_at DESC LIMIT 1;"
```

Expected: `partner_gross_earning + platform_fee + tenant_net_earning + affiliate_commission` equals
the commission base exactly, and `platform_fee` is 2% of the **net** (e.g. 37,037 on a 2,000,000 đ
booking, not 40,000).

- [ ] **Step 5: Verify the exempt path**

Book a listing belonging to **Trang Makeup** (`household_below_threshold`). Expected: the frozen
`tax` shows `vatBps: 0`, and the split matches the pre-VAT numbers exactly (tenant 15% of gross).

- [ ] **Step 6: Commit any fixes**

```bash
git add -A
git commit -m "fix(api): corrections from the dynamic VAT verification pass"
```

Docs are updated once, for both features, in Task 12.

---

### Task 9: Platform-fee write path (backend)

**Files:**
- Modify: `apps/api/src/modules/identity-access/domain/permission-catalog.ts`
- Modify: `packages/contracts/src/contracts/finance.ts`
- Modify: `apps/api/src/modules/finance/domain/ports/commission-rule-repository.port.ts`
- Modify: `apps/api/src/modules/finance/infrastructure/repositories/prisma-commission-rule.repository.ts`
- Create: `apps/api/src/modules/finance/application/use-cases/update-tenant-platform-rate.use-case.ts`
- Modify: `apps/api/src/modules/finance/infrastructure/http/dto/finance.dto.ts`
- Modify: `apps/api/src/modules/finance/infrastructure/http/platform-finance.controller.ts`
- Modify: `apps/api/src/modules/finance/infrastructure/http/finance.module.ts`

**Interfaces:**
- Consumes: existing `CommissionRule.withPlatformRate(rate, isHouse)` — written for exactly this and
  currently dead code with no caller; `isHousePartner(tx, partnerId)`.
- Produces: permission `platform.finance.manage`; `updatePlatformRateInputSchema` /
  `UpdatePlatformRateInput`; `ICommissionRuleRepository.updatePlatformRateForTenant(tx, rate)`;
  `UpdateTenantPlatformRateUseCase.execute(tenantId, input): Promise<CommissionRuleRecord[]>`;
  `PATCH /platform/finance/tenants/:tenantId/platform-rate`.

**Two things that make this more than a CRUD endpoint:**
1. **Every rule of the tenant must be rewritten, not just `tenant_default`.** An override copies the
   platform rate at creation time (`CreateCommissionRuleUseCase:27-29`), so updating only the default
   would silently keep billing overridden partners the old fee.
2. **Validation is all-or-nothing.** A tenant whose `tenant_default` takes 15% but who has a
   partner override at 3% cannot carry a 5% platform fee — `platform% + affiliate% <= tenant%` would
   break. Validate every rule first, write nothing if any fails.

Past bookings are unaffected either way: they replay `commission_snapshot` (§13.1).

- [ ] **Step 1: Add the permission**

In `permission-catalog.ts`, after `{ key: 'platform.finance.read', scopeLevel: 'platform' },`:

```ts
  { key: 'platform.finance.manage', scopeLevel: 'platform' },
```

`Super Admin` picks it up automatically via `keysOf('platform')`. `Support` lists its permissions
explicitly and must **not** get it — changing a fee is not a support action.

- [ ] **Step 2: Add the contract**

In `packages/contracts/src/contracts/finance.ts`, after `updateCommissionRuleInputSchema`:

```ts
/**
 * Platform-admin-only: set a tenant's platform fee. Applies to EVERY rule the
 * tenant has, because overrides carry their own copy of the rate.
 */
export const updatePlatformRateInputSchema = z.object({
  platformRate: z.number().int().min(0).max(100),
});
export type UpdatePlatformRateInput = z.infer<typeof updatePlatformRateInputSchema>;
```

- [ ] **Step 3: Add the port method**

In `commission-rule-repository.port.ts`, inside `ICommissionRuleRepository`:

```ts
  /** Set the platform fee on every rule of the current tenant (RLS-scoped). */
  updatePlatformRateForTenant(tx: PrismaTx, platformRate: number): Promise<number>;
```

- [ ] **Step 4: Implement it in the Prisma repository**

Append to `PrismaCommissionRuleRepository`, after `update()`:

```ts
  async updatePlatformRateForTenant(tx: PrismaTx, platformRate: number): Promise<number> {
    // No `where` clause: RLS confines updateMany to the tx's tenant.
    const { count } = await tx.commissionRule.updateMany({ data: { platformRate } });
    return count;
  }
```

- [ ] **Step 5: Create the use-case**

`apps/api/src/modules/finance/application/use-cases/update-tenant-platform-rate.use-case.ts`:

```ts
import { Inject, Injectable } from '@nestjs/common';
import type { UpdatePlatformRateInput } from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  COMMISSION_RULE_REPOSITORY,
  type CommissionRuleRecord,
  type ICommissionRuleRepository,
} from '../../domain/ports/commission-rule-repository.port';
import { CommissionRule } from '../../domain/entities/commission-rule.entity';
import { isHousePartner } from '../is-house-partner';

/**
 * Platform admin sets a tenant's platform fee % (§7.7). Until this existed the
 * column had no write path at all — changing the 2% meant hand-written SQL.
 *
 * Rewrites EVERY rule of the tenant, not just `tenant_default`: an override
 * copies the platform rate when it is created, so leaving overrides behind would
 * keep billing them the old fee.
 *
 * All-or-nothing. If the new rate would push any single rule past the
 * `platform% + affiliate% <= tenant%` floor the whole change is rejected, because
 * a half-applied fee change is worse than a refused one. House-partner rules
 * waive the floor, matching the create/update paths.
 *
 * Past bookings never move: they replay `commission_snapshot` (§13.1).
 */
@Injectable()
export class UpdateTenantPlatformRateUseCase {
  constructor(
    @Inject(COMMISSION_RULE_REPOSITORY) private readonly rules: ICommissionRuleRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  execute(tenantId: string, input: UpdatePlatformRateInput): Promise<CommissionRuleRecord[]> {
    return this.tenantDb.forTenant(tenantId, async (tx) => {
      for (const rule of await this.rules.list(tx)) {
        const isHouse =
          rule.appliesTo === 'partner' && rule.partnerId
            ? await isHousePartner(tx, rule.partnerId)
            : false;
        // Throws CommissionRatesNegativeTenant if this rule cannot carry the fee.
        CommissionRule.rehydrate(rule).withPlatformRate(input.platformRate, isHouse);
      }
      await this.rules.updatePlatformRateForTenant(tx, input.platformRate);
      return this.rules.list(tx);
    });
  }
}
```

- [ ] **Step 6: Add the DTO**

In `finance.dto.ts`, beside `UpdateCommissionRuleDto`:

```ts
export class UpdatePlatformRateDto extends createZodDto(updatePlatformRateInputSchema) {}
```

Add `updatePlatformRateInputSchema` to the existing `@booking/contracts` import at the top.

- [ ] **Step 7: Add the endpoint**

In `platform-finance.controller.ts`, extend the imports:

```ts
import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { ZodValidationPipe } from '../../../../shared/validation/zod-validation.pipe';
import { uuidSchema } from '@booking/contracts';
import { UuidParam } from '../../../../shared/openapi/decorators';
import { UpdateTenantPlatformRateUseCase } from '../../application/use-cases/update-tenant-platform-rate.use-case';
import { toCommissionRuleResponse } from '../../application/finance.mapper';
import { CommissionRuleResponseDto, UpdatePlatformRateDto } from './dto/finance.dto';
```

Inject it in the constructor:

```ts
    private readonly updatePlatformRate: UpdateTenantPlatformRateUseCase,
```

Add the route:

```ts
  @RequirePermissions('platform.finance.manage')
  @Patch('tenants/:tenantId/platform-rate')
  @ApiOperation({ summary: "Set a tenant's platform fee % across all its commission rules" })
  @UuidParam('tenantId')
  @ApiOkResponse({ type: [CommissionRuleResponseDto] })
  async setPlatformRate(
    @Param('tenantId', new ZodValidationPipe(uuidSchema)) tenantId: string,
    @Body() input: UpdatePlatformRateDto,
  ): Promise<CommissionRuleResponse[]> {
    return (await this.updatePlatformRate.execute(tenantId, input)).map(toCommissionRuleResponse);
  }
```

Add `CommissionRuleResponse` to the type-only `@booking/contracts` import at the top of the file.
If `UuidParam` does not accept a parameter name, use it bare — it is OpenAPI documentation only.

- [ ] **Step 8: Register the use-case in `finance.module.ts`**

Add the import and list `UpdateTenantPlatformRateUseCase` in `providers`.

- [ ] **Step 9: Verify**

```bash
pnpm --filter=@booking/contracts build
pnpm --filter=@booking/api typecheck && pnpm --filter=@booking/api lint
pnpm --filter=@booking/api seed   # re-seed so the new permission reaches Super Admin
```

Then exercise it against a running API (`pnpm --filter=@booking/api dev`), logged in as
`admin@bookingos.local`. Expected: `PATCH /platform/finance/tenants/<id>/platform-rate` with
`{"platformRate": 3}` returns every rule of that tenant showing `platformRate: 3`; the same call with
`{"platformRate": 99}` returns a `CommissionRatesNegativeTenant` error and changes **nothing**
(re-read the rules to confirm).

- [ ] **Step 10: Commit**

```bash
git add apps/api packages/contracts
git commit -m "feat(api): let a platform admin set a tenant's platform fee"
```

---

### Task 10: Platform-fee admin UI

**Files:**
- Modify: `apps/dashboard/app/constants/api-paths.ts`
- Create: `apps/dashboard/app/features/admin/components/tenant-platform-rate-card.tsx`
- Modify: `apps/dashboard/app/features/admin/server/tenant-detail-actions.server.ts`
- Modify: `apps/dashboard/app/routes/admin/tenants/detail.tsx`

**Interfaces:**
- Consumes: `PATCH /platform/finance/tenants/:tenantId/platform-rate` (Task 9),
  `updatePlatformRateInputSchema`.
- Produces: `ActionScope` gains `'platform-rate'`; the tenant detail page renders
  `<TenantPlatformRateCard />`.

The card belongs on the **admin tenant detail** page (`/admin/tenants/:id`), beside the existing
subscription and config sections, since the fee is a per-tenant commercial term. The dashboard is
Vietnamese-hardcoded — no i18n keys.

- [ ] **Step 1: Add the API path**

In `api-paths.ts`, inside the `platform` block:

```ts
    /** PATCH a tenant's platform fee % (platform.finance.manage). */
    tenantPlatformRate: (tenantId: string) =>
      `/platform/finance/tenants/${segment(tenantId)}/platform-rate`,
```

- [ ] **Step 2: Load the tenant's current rate in the detail loader**

The page must show today's value before it can edit it. In the `detail.tsx` loader, fetch the
tenant's commission rules alongside the existing tenant fetch and pass
`tenantDefault?.platformRate ?? null` to the card. If no platform-scoped endpoint lists another
tenant's rules, read it from the tenant detail response instead — extend
`GetTenantDetailUseCase` to include `platformRate` from the tenant's `tenant_default` rule, and add
`platformRate: z.number().nullable()` to `tenantDetailResponseSchema` in
`packages/contracts/src/contracts/tenancy.ts`. Prefer this second route: one round trip, and the
value belongs with the rest of the tenant's commercial terms.

- [ ] **Step 3: Create the card**

`apps/dashboard/app/features/admin/components/tenant-platform-rate-card.tsx`:

```tsx
import { Percent } from 'lucide-react';
import { useFetcher } from 'react-router';
import { Button } from '@booking/ui/components/ui/button';
import { Input } from '@booking/ui/components/ui/input';
import { Label } from '@booking/ui/components/ui/label';
import { DetailSection } from '@booking/ui/components/detail/detail-section';

/**
 * Platform fee % for one tenant. Applies to EVERY commission rule the tenant has,
 * so the copy says so — an admin who thinks this only edits the default would
 * under-bill every overridden partner.
 */
export function TenantPlatformRateCard({
  tenantId,
  platformRate,
  busy,
  error,
}: {
  tenantId: string;
  platformRate: number | null;
  busy: boolean;
  error: string | null;
}) {
  const fetcher = useFetcher();
  return (
    <DetailSection icon={<Percent className="size-4 text-muted-foreground" />} title="Phí nền tảng">
      <fetcher.Form method="post" className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="intent" value="set-platform-rate" />
        <input type="hidden" name="tenantId" value={tenantId} />
        <div className="grid gap-1.5">
          <Label htmlFor="platformRate">Phí nền tảng (%)</Label>
          <Input
            id="platformRate"
            name="platformRate"
            type="number"
            min={0}
            max={100}
            step={1}
            defaultValue={platformRate ?? 0}
            className="w-28"
          />
        </div>
        <Button type="submit" disabled={busy}>
          Lưu
        </Button>
      </fetcher.Form>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">
        Áp dụng cho tất cả quy tắc hoa hồng của tenant này, kể cả các quy tắc riêng theo
        partner/loại dịch vụ. Booking đã tạo không đổi — chúng dùng mức phí đã đóng băng lúc đặt.
      </p>
      {error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}
    </DetailSection>
  );
}
```

If `DetailSection` requires different props than `icon`/`title`, match its actual signature — read
`packages/ui/src/components/detail/detail-section.tsx` first and adapt rather than guessing.

- [ ] **Step 4: Handle the action**

In `tenant-detail-actions.server.ts`, extend the scope union:

```ts
export type ActionScope = 'tenant' | 'domain' | 'subscription' | 'status' | 'platform-rate';
```

In the form-data branch of the action, add the `set-platform-rate` intent:

```ts
  if (intent === 'set-platform-rate') {
    const { auth } = await requirePlatform(request, 'platform.finance.manage');
    const parsed = updatePlatformRateInputSchema.safeParse({
      platformRate: Number(form.get('platformRate')),
    });
    if (!parsed.success) {
      return data<ActionResult>(
        { scope: 'platform-rate', error: 'Phí nền tảng phải là số nguyên từ 0 đến 100.' },
        { status: 400 },
      );
    }
    const res = await apiPatch(apiPaths.platform.tenantPlatformRate(id), parsed.data, auth);
    if (!res.ok) {
      return data<ActionResult>({ scope: 'platform-rate', error: res.error }, { status: 400 });
    }
    return data<ActionResult>({
      scope: 'platform-rate',
      ok: true,
      message: 'Đã cập nhật phí nền tảng.',
    });
  }
```

Import `updatePlatformRateInputSchema` from `@booking/contracts`. Match the surrounding file's
existing intent-dispatch style — if it discriminates on something other than an `intent` field,
follow that instead.

- [ ] **Step 5: Render the card**

In `detail.tsx`, import and place it directly above `<TenantConfigSection tenant={tenant} />`:

```tsx
      <TenantPlatformRateCard
        tenantId={tenant.id}
        platformRate={tenant.platformRate}
        busy={busy}
        error={scopedError('platform-rate')}
      />
```

- [ ] **Step 6: Verify by using it**

```bash
pnpm --filter=@booking/dashboard typecheck && pnpm --filter=@booking/dashboard lint
pnpm dev
```

Log in at `http://localhost:5174` as `admin@bookingos.local` / `admin-dev-password`, open
**BookingStudio**, set the platform fee to 3, save. Expected: success message; reload shows 3; the
tenant's own finance screen (`/tenant/finance`) shows "Phí nền tảng 3%" on every rule. Set it back
to 2. Then try 99 and confirm the error surfaces in the card and nothing changes.

- [ ] **Step 7: Commit**

```bash
git add apps/dashboard packages/contracts
git commit -m "feat(dashboard): admin control for a tenant's platform fee"
```

---

### Task 11: Truthful VAT copy in the storefront

**Files:**
- Modify: `packages/i18n/src/locales/vi/checkout.ts:45`
- Modify: `packages/i18n/src/locales/en/checkout.ts:47`
- Modify: `packages/i18n/src/locales/vi/account.ts:159`
- Modify: `packages/i18n/src/locales/en/account.ts:162`
- Modify: `packages/contracts/src/contracts/listing.ts` (`quoteResponseSchema`)
- Modify: `apps/storefront/app/features/checkout/components/price-panel.tsx:85`
- Modify: `apps/storefront/app/features/booking/components/booking-detail-sections.tsx:82-94`

**Interfaces:**
- Consumes: the tax snapshot (Task 4) and `vatFromGross` (Task 2).
- Produces: `quoteResponseSchema` gains `vatBps: z.number()` and `vatAmount: z.string()`.

**The bug being fixed is bigger than a stale percentage.** The storefront currently tells every
customer, at checkout and on the booking detail:

> vi: `Giá đã bao gồm: Thuế 8%, Phí dịch vụ 5%`
> en: `Price includes 8% tax and 5% service fee`

Two separate defects:

1. **"Phí dịch vụ 5%" / "5% service fee" does not exist.** No 5% customer-facing service fee is
   charged anywhere in this system. The platform fee is 2% and comes out of the *tenant's* share —
   the customer never pays it. This is a false statement about a charge, shown at the moment of
   payment. It must be deleted regardless of anything VAT-related.
2. **"Thuế 8%" is hardcoded**, so it is wrong from 2027-01-01 and already wrong today for a
   VAT-exempt seller like the seeded `trang-makeup` partner, whose bookings carry 0% VAT.

- [ ] **Step 1: Expose VAT on the quote**

The checkout price panel renders before a booking exists, so it must read the quote. In
`quoteResponseSchema` (`packages/contracts/src/contracts/listing.ts:950`), add:

```ts
  /** VAT contained in `subtotal`, basis points — 800 = 8%, 0 = seller charges no VAT. */
  vatBps: z.number(),
  /** VND đồng digit string; the VAT already inside `subtotal`. */
  vatAmount: z.string(),
```

Populate both in the quote use-case by resolving the rate exactly as
`ResolveCommissionUseCase.resolveTax` does — same seller-status and listing-type gates, same
`selectTaxRate` call, with the requested slot start as the service date — then
`vatFromGross(subtotal, vatBps)`. Extract that resolution into a shared private helper rather than
duplicating the gate logic, so checkout and booking creation can never disagree about the rate.

- [ ] **Step 2: Rewrite the i18n strings as parameterised, honest copy**

`packages/i18n/src/locales/vi/checkout.ts:45`:

```ts
  totalIncludes: 'Đã bao gồm thuế GTGT {{percent}}%',
  totalNoVat: 'Giá cuối cùng, không chịu thuế GTGT',
```

`packages/i18n/src/locales/en/checkout.ts:47`:

```ts
  totalIncludes: 'Includes {{percent}}% VAT',
  totalNoVat: 'Final price, not subject to VAT',
```

`packages/i18n/src/locales/vi/account.ts:159`:

```ts
      taxNote: 'Đã bao gồm thuế GTGT {{percent}}% ({{amount}})',
      taxNoteNone: 'Giá cuối cùng, không chịu thuế GTGT',
```

`packages/i18n/src/locales/en/account.ts:162`:

```ts
      taxNote: 'Includes {{percent}}% VAT ({{amount}})',
      taxNoteNone: 'Final price, not subject to VAT',
```

The service-fee clause is gone from all four. Do not replace it with "2%" — the customer does not
pay the platform fee, so naming it at checkout would be a different false statement.

- [ ] **Step 3: Use the quote's rate in the checkout panel**

`price-panel.tsx:85` — replace the single line with:

```tsx
      <p className="mt-0.5 text-xs leading-4 text-muted-foreground">
        {quote.vatBps > 0
          ? t('totalIncludes', { percent: quote.vatBps / 100 })
          : t('totalNoVat')}
      </p>
```

- [ ] **Step 4: Use the frozen snapshot on the booking detail**

`booking-detail-sections.tsx` — the `PaymentTaxNote` component must read the booking's frozen VAT
rather than a constant. Add `vatBps` and `vatAmount` to `BookingDetailViewModel` (sourced from
`commissionSnapshot.tax` and `vatFromGross` on the booking's final amount), then:

```tsx
      {state === 'cancelled'
        ? t('bookings.refund.policyNote', { percent: booking.refundPercent ?? 0 })
        : booking.vatBps > 0
          ? t('bookings.payment.taxNote', {
              percent: booking.vatBps / 100,
              amount: formatVnd(booking.vatAmount),
            })
          : t('bookings.payment.taxNoteNone')}
```

Use whichever currency formatter the surrounding file already imports.

- [ ] **Step 5: Verify both states in the running app**

```bash
pnpm --filter=@booking/i18n build
pnpm --filter=@booking/contracts build
pnpm turbo lint typecheck
pnpm dev
```

On `http://bookingstudio.localhost:5173`, open checkout for a **Giang Studio** listing
(`company_vat`). Expected: "Đã bao gồm thuế GTGT 8%" — no service-fee text anywhere.
Then a **Trang Makeup** listing (`household_below_threshold`). Expected: "Giá cuối cùng, không chịu
thuế GTGT". Complete one booking of each and confirm the booking-detail note matches, with the VAT
amount shown for the first.

- [ ] **Step 6: Commit**

```bash
git add packages/i18n packages/contracts apps/storefront
git commit -m "fix(storefront): show the real VAT rate and drop the non-existent service fee"
```

---

### Task 12: Documentation

**Files:**
- Modify: `TONG-QUAN.md`
- Modify: `docs/data-model.md`
- Modify: `docs/conventions.md`
- Modify: `AGENTS.md`
- Create: `docs/features/vat.md`

- [ ] **Step 1: Write the feature doc**

Create `docs/features/vat.md` covering: the platform-owns-rate / tenant-owns-classification split;
why `tax_rates` is global; the gross-price definition; Option B and the worked 2,000,000 đ example
from Task 5; why the ledger needed no new entry type; the service-date rule and the 2027-01-01
changeover; and the deferred NĐ 117/2025 withholding. Follow the shape of the existing
`docs/features/favorites.md`.

- [ ] **Step 2: Fix the stale "out of scope" line in `TONG-QUAN.md`**

Line ~1359 currently reads "Vietnamese tax / e-invoicing | Out of scope for the MVP". VAT is now
implemented; only e-invoicing is out. Narrow that row to e-invoicing and link `docs/features/vat.md`.
Line ~1384 ("VAT invoices / e-invoices for business customers") stays — still true.

Also update §3.3 / §13.2: the worked example's commission is now computed on the net base, so the
journal figures change (partner 1,722,222 / platform 37,037 / tenant 240,741 on a 2,000,000 đ
booking at 8%). Leaving the old numbers would make the doc contradict the code.

- [ ] **Step 3: Update `docs/data-model.md`**

Add `tax_rates` to the model list, note it as the one global finance table with no RLS, and record in
"money & rate units" that prices are **VAT-inclusive gross** while commission rates apply to the net
base. Note the new `listing_types.tax_category`, `partners.tax_status`, `tenants.tax_status` columns.

- [ ] **Step 4: Update `docs/conventions.md`**

Record the rule that `vatFromGross` — never `percentOfBps` — is used for VAT on an inclusive price,
and that any new money display must read the frozen snapshot rather than a constant.

- [ ] **Step 5: Update `AGENTS.md`**

In "Load-bearing always / never", add a line: money is bigint VND **and prices are VAT-inclusive
gross; every commission rate applies to the net base** (`docs/features/vat.md`). Add
`docs/features/vat.md` to the "Deeper docs" list beside the other feature docs.

- [ ] **Step 6: Final full static check**

```bash
pnpm check:no-tests && pnpm check:module-cycles && pnpm check:frontend-structure \
  && pnpm --filter=@booking/storefront security \
  && pnpm turbo lint typecheck build \
  && pnpm --filter=@booking/api check:rls
```

Expected: every gate green.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "docs: document dynamic VAT, the net commission base and the platform-fee control"
```

---

## Explicitly out of scope

Each of these is a real follow-up, deliberately not in this plan:

1. **Tenant-facing UI** for setting `listing_types.tax_category` and `partners.tax_status`. Until it
   exists, classification is seed/SQL only — a tenant cannot mark a listing type exempt or flag a
   partner as VAT-registered without a DB write. This is the **largest remaining gap** for a real
   tenant and touches two modules (catalog + partner), so it deserves its own plan.
2. **NĐ 117/2025 withholding** — when the tenant has the payment function and the partner is a
   household/individual, the tenant must withhold 5% VAT + 2% PIT and remit. This is what a
   `vat_withheld` ledger entry type would be for, and it changes the payout amount, so it needs its
   own plan and an accountant's sign-off.
3. **E-invoicing** (hóa đơn điện tử) and VAT reporting exports.
4. **Audit trail for platform-fee changes.** Task 9 writes the new rate but records no history of who
   changed it or when. Worth adding when more than one admin exists.

## Open question for the accountant (does not block this plan)

Whether the platform's **subscription fee** is "dịch vụ phần mềm" and therefore VAT-exempt under Luật
48/2024/QH15 Đ.5. It affects only the platform→tenant invoice, which this plan does not touch —
but being exempt would also forfeit input-VAT deduction on infrastructure spend, so it is worth
settling before the first real invoice.
