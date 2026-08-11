# NĐ 117/2025 Withholding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When the tenant holds the money and the partner is a household or individual, withhold VAT + PIT from the partner's payout and record the liability, as Nghị định 117/2025/NĐ-CP requires of an entity with a payment function.

**Architecture:** Withholding is a *deduction from what the tenant owes the partner*, not a new charge. It is resolved and frozen at booking time beside the VAT snapshot, computed by the same pure split kernel, and lands as two new ledger legs so the journal still balances. `partner_payable` drops by the withheld amount; nobody else's figure moves.

**Tech Stack:** NestJS 11 (hexagonal, no service classes), Prisma + hand-written SQL migrations, PostgreSQL 16 with RLS, bigint VND money.

## ⛔ Do not start before these are answered

This plan is **blocked on an accountant**, not on engineering. Three questions change the numbers, and building first means building twice:

1. **What is the withholding base** — the full price the customer paid (280,000), or what the partner nets after commission (240,100)? This plan assumes **the full price**, on the reasoning that the percentage method exists precisely because it does not allow expense deduction, and the tenant's commission is the partner's expense. If the answer is the net, every figure below changes.
2. **Does a household under the 200M ₫/year threshold still get withheld at source?** They owe neither VAT nor PIT for the year, yet the platform withholds per transaction. Either the threshold exempts them from withholding too, or they are withheld and reconcile annually. This plan assumes **exempt** — consistent with how the codebase already resolves them to 0% VAT.
3. **Is the tenant or the platform the "đơn vị có chức năng thanh toán"?** Money lands in the tenant's gateway account (`TONG-QUAN.md` §risk 2), so the duty looks like the tenant's. Today both are the same legal entity, so it is moot — but the answer decides who is fined when it is not.

Question 3 is currently answered by the owner: **tenant and platform are one company**, with no third-party tenants yet. That removes the ambiguity for now and is why this plan puts the withholding on the tenant side of the ledger.

## Global Constraints

- **NO TESTS, ever** (AGENTS.md hard rule 1 / ADR 0005). Verification is `typecheck` + `lint` + `build` + `check:rls` + running the app.
- Backend flow is **`controller → use-case → repository-port → repository`**. No service classes.
- **One use-case = one file**, one exported `@Injectable XxxUseCase`, one public `execute()`.
- **Migrations are hand-authored** (ADR 0004). A tenant-scoped table needs FORCE RLS + a `tenant_isolation` policy or `check:rls` fails.
- Money is `bigint` VND đồng; rates are integers in basis points.
- `ledger_entries` are immutable — a mistake is corrected by a reversing entry, never an edit. Get the legs right before shipping.

## Rates (NĐ 117/2025, resident individuals)

| Activity | VAT | PIT |
| --- | --- | --- |
| **Services** — everything a booking platform sells | **5%** | **2%** |
| Goods | 1% | 0.5% |
| Transport / services attached to goods | 3% | 1.5% |

Only services matter here, but the schedule is stored rather than hardcoded so the others are one row each when a vertical needs them.

## Who gets withheld

Reuses `partners.tax_status`, already in the schema:

| Status | VAT regime today | Withholding |
| --- | --- | --- |
| `company_vat` | deduction 8/10% | **none** — a company invoices and declares for itself |
| `household_declaring` | percentage 5% | **5% VAT + 2% PIT** |
| `household_below_threshold` | 0 | **none** (assumption 2) |
| `individual` | 0 | **none** (assumption 2) |

Note the coincidence that makes this tractable: for `household_declaring` the 5% withheld VAT **is** their percentage-method VAT obligation, already computed by `resolve-tax`. The withholding is the collection mechanism, not a second tax. Only the 2% PIT is genuinely new money leaving the partner.

## Worked example (280,000 ₫, household_declaring, tenant 15% / platform 2%)

```
Giá bán (gross)                                    280,000
VAT tỷ lệ 5%                                        14,000   ← already computed today
Doanh thu net → base hoa hồng                      266,000
Hoa hồng tenant 15% × net                           39,900
Partner được hưởng (gross residual)                240,100   ← already computed today
  khấu trừ VAT 5% × 280,000                       −14,000   ← NEW
  khấu trừ TNCN 2% × 280,000                       −5,600   ← NEW
Partner thực nhận                                  220,500
Tenant nợ nhà nước (nộp thay)                       19,600   ← NEW liability
```

The invariant to preserve: `partnerShare + platformFee + affiliate + tenantNet` still equals the cash. Withholding **splits** `partnerShare` into what the partner receives and what the tenant remits; it does not change the total.

## File Structure

| File | Responsibility |
| --- | --- |
| `apps/api/prisma/schema.prisma` | *Modify.* `withholding_rates` (global, like `tax_rates`); `booking_settlements.partner_vat_withheld` + `partner_pit_withheld`. |
| `apps/api/prisma/migrations/2026xxxx_nd117_withholding/migration.sql` | *Create.* DDL + `GRANT` + the two new `ledger_entry_type` values. |
| `apps/api/src/shared/domain/tax/withholding.ts` | *Create.* Pure: `WithholdingRate`, `selectWithholdingRate`, `withholdingFor(status)`, `WithholdingSnapshot`. |
| `apps/api/src/shared/domain/commission/commission-snapshot.ts` | *Modify.* Freeze `withholding` beside `tax`. |
| `apps/api/src/shared/domain/commission/commission-split.ts` | *Modify.* Return `partnerVatWithheld` / `partnerPitWithheld`; `partnerShare` unchanged. |
| `apps/api/src/modules/finance/domain/ports/withholding-rate-repository.port.ts` | *Create.* Port + token. |
| `apps/api/src/modules/finance/infrastructure/repositories/prisma-withholding-rate.repository.ts` | *Create.* Reads the global table. |
| `apps/api/src/modules/finance/application/use-cases/resolve-withholding.use-case.ts` | *Create.* Resolves + freezes, mirroring `ResolveTaxUseCase`. |
| `apps/api/src/modules/finance/domain/entities/ledger-journal.entity.ts` | *Modify.* Two legs on the revenue journal. |
| `apps/api/src/modules/finance/domain/entities/settlement.entity.ts` | *Modify.* `partnerPayable` net of withholding. |
| `apps/api/prisma/seed/withholding-rates.ts` | *Create.* The NĐ 117 schedule, every scope. |

---

### Task 1: Schema + migration

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/2026xxxx_nd117_withholding/migration.sql`

**Interfaces:**
- Produces: table `withholding_rates`; columns `booking_settlements.partner_vat_withheld`, `.partner_pit_withheld`; enum values `vat_withheld`, `pit_withheld`.

- [ ] **Step 1: Add the rate table to `schema.prisma`**

Beside `TaxRate`, and global for the same reason — the schedule is national law:

```prisma
/// NĐ 117/2025 withholding schedule. GLOBAL reference data — no `tenant_id`, no
/// RLS. Rates are what the payment-function operator withholds from a household
/// or individual seller and remits on their behalf.
model WithholdingRate {
  id            String   @id @default(uuid(7)) @db.Uuid
  /// `service` | `goods` | `transport` — only `service` is used today.
  activity      String
  /// VAT withheld, basis points. 500 = 5%.
  vatBps        Int      @map("vat_bps")
  /// Personal income tax withheld, basis points. 200 = 2%.
  pitBps        Int      @map("pit_bps")
  effectiveFrom DateTime @map("effective_from") @db.Timestamptz(6)
  effectiveTo   DateTime? @map("effective_to") @db.Timestamptz(6)
  legalRef      String   @map("legal_ref")
  createdAt     DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt     DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)

  @@unique([activity, effectiveFrom])
  @@map("withholding_rates")
}
```

- [ ] **Step 2: Add the settlement columns**

In `model BookingSettlement`, beside `partnerPayable`:

```prisma
  /// Withheld from the partner and remitted by the tenant (§NĐ117). Recorded
  /// separately from `partner_payable` so a payout statement can show the
  /// deduction rather than an unexplained smaller number.
  partnerVatWithheld BigInt @default(0) @map("partner_vat_withheld")
  partnerPitWithheld BigInt @default(0) @map("partner_pit_withheld")
```

- [ ] **Step 3: Write the migration**

```sql
-- NĐ 117/2025: the entity with the payment function withholds VAT + PIT from a
-- household/individual seller and remits on their behalf. This is a DEDUCTION
-- from what the tenant owes the partner, never a new charge to the customer.

ALTER TYPE "ledger_entry_type" ADD VALUE IF NOT EXISTS 'vat_withheld';
ALTER TYPE "ledger_entry_type" ADD VALUE IF NOT EXISTS 'pit_withheld';

CREATE TABLE "withholding_rates" (
  "id" UUID NOT NULL,
  "activity" TEXT NOT NULL,
  "vat_bps" INTEGER NOT NULL,
  "pit_bps" INTEGER NOT NULL,
  "effective_from" TIMESTAMPTZ(6) NOT NULL,
  "effective_to" TIMESTAMPTZ(6),
  "legal_ref" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "withholding_rates_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "withholding_rates_activity_effective_from_key" UNIQUE ("activity", "effective_from"),
  CONSTRAINT "withholding_rates_bps_range_check"
    CHECK ("vat_bps" BETWEEN 0 AND 10000 AND "pit_bps" BETWEEN 0 AND 10000),
  CONSTRAINT "withholding_rates_window_check"
    CHECK ("effective_to" IS NULL OR "effective_to" > "effective_from")
);

-- Reference data the app only reads; writes go through the seed connection.
GRANT SELECT ON "withholding_rates" TO app_user, app_admin;

ALTER TABLE "booking_settlements"
  ADD COLUMN "partner_vat_withheld" BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN "partner_pit_withheld" BIGINT NOT NULL DEFAULT 0;
```

- [ ] **Step 4: Apply and verify**

```bash
export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh" && nvm use
pnpm --filter=@booking/api prisma:deploy && pnpm --filter=@booking/api prisma:generate
pnpm --filter=@booking/api check:rls
```

Expected: clean, and `check:rls` still reports the same tenant-scoped table count — `withholding_rates` has no `tenant_id` and must not appear.

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma
git commit -m "feat(api): add the NĐ 117 withholding schedule and settlement columns"
```

---

### Task 2: Pure withholding domain

**Files:**
- Create: `apps/api/src/shared/domain/tax/withholding.ts`

**Interfaces:**
- Produces: `WithholdingRateCandidate`, `selectWithholdingRate(rates, activity, at)`, `partnerIsWithheld(status)`, `WithholdingSnapshot`, `noWithholding(at)`.

- [ ] **Step 1: Create the file**

```ts
import type { PartnerTaxStatus } from './tax';

/**
 * NĐ 117/2025 withholding — pure. Mirrors `tax.ts` deliberately: same shape of
 * candidate + time-window selection + frozen snapshot, so the two read alike.
 *
 * Withholding is NOT a tax on anyone new. It is the platform collecting a
 * household seller's own obligation at source and remitting it, which is why it
 * reduces `partner_payable` and creates a tenant liability rather than changing
 * what the customer pays or what the tenant earns.
 */
export interface WithholdingRateCandidate {
  id: string;
  activity: string;
  vatBps: number;
  pitBps: number;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  legalRef: string;
}

/**
 * Only a household or individual is withheld from. A company invoices and
 * declares for itself, so withholding from it would be double collection.
 *
 * `household_below_threshold` and `individual` return false on the standing
 * assumption that the 200M ₫/year exemption also exempts them from withholding —
 * see the blocking questions at the top of this plan. If the accountant says
 * otherwise, this one function is where that changes.
 */
export function partnerIsWithheld(status: PartnerTaxStatus): boolean {
  return status === 'household_declaring';
}

/** The rate in force for `activity` at `at`; time is the only axis, as in `tax.ts`. */
export function selectWithholdingRate(
  rates: WithholdingRateCandidate[],
  activity: string,
  at: Date,
): WithholdingRateCandidate | null {
  const applicable = rates.filter(
    (r) =>
      r.activity === activity &&
      at >= r.effectiveFrom &&
      (r.effectiveTo === null || at < r.effectiveTo),
  );
  if (applicable.length === 0) return null;
  return applicable.reduce((best, r) => (r.effectiveFrom > best.effectiveFrom ? r : best));
}

/** Frozen onto the booking so a payout statement can be reproduced years later. */
export interface WithholdingSnapshot {
  rateId: string | null;
  activity: string | null;
  vatBps: number;
  pitBps: number;
  legalRef: string | null;
  resolvedFor: string;
}

export function noWithholding(resolvedFor: Date): WithholdingSnapshot {
  return {
    rateId: null,
    activity: null,
    vatBps: 0,
    pitBps: 0,
    legalRef: null,
    resolvedFor: resolvedFor.toISOString(),
  };
}
```

- [ ] **Step 2: Verify**

```bash
pnpm --filter=@booking/api typecheck && pnpm --filter=@booking/api lint
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/shared/domain/tax/withholding.ts
git commit -m "feat(api): add the pure NĐ 117 withholding domain"
```

---

### Task 3: Split the partner's share into received and withheld

**Files:**
- Modify: `apps/api/src/shared/domain/commission/commission-split.ts`
- Modify: `apps/api/src/shared/domain/commission/commission-snapshot.ts`

**Interfaces:**
- Consumes: `WithholdingSnapshot` (Task 2).
- Produces: `CommissionSplit` gains `partnerVatWithheld`, `partnerPitWithheld`; `CommissionRates` gains `withholdingVatBps`, `withholdingPitBps`.

**The invariant this must not break:** `partnerShare + platformFee + affiliateCommission + tenantNet == finalAmount`. Withholding is carved **out of** `partnerShare`, so `partnerShare` itself must not change — only what is paid out of it.

- [ ] **Step 1: Extend `CommissionRates`**

```ts
  /**
   * NĐ 117 withholding, basis points; 0 when the seller is not withheld from.
   * Applied to the GROSS price — the percentage method that governs a withheld
   * seller allows no expense deduction, so the tenant's commission is not netted
   * off first (see the blocking questions).
   */
  withholdingVatBps: number;
  withholdingPitBps: number;
```

- [ ] **Step 2: Compute the two legs**

Inside `computeCommissionSplit`, after `partnerShare` is final (i.e. after the floor):

```ts
  // Carved OUT of the partner's share, never added on top: the tenant pays the
  // state instead of the partner. `partnerShare` therefore stays exactly what it
  // was, and the cash invariant is untouched.
  const withholdingBasis = fundedBy === 'tenant' ? totalAmount : finalAmount;
  let partnerVatWithheld = pct(withholdingBasis, rates.withholdingVatBps / 100);
  let partnerPitWithheld = pct(withholdingBasis, rates.withholdingPitBps / 100);
  const withheldTotal = partnerVatWithheld + partnerPitWithheld;
  if (withheldTotal > partnerShare) {
    // A fixed-fee commission can leave a partner share smaller than the statutory
    // withholding. Cap rather than pay the state out of the tenant's own money,
    // and flag it — this needs a human, not a silent adjustment.
    partnerVatWithheld = 0n;
    partnerPitWithheld = 0n;
    flags.push('WITHHOLDING_EXCEEDS_PARTNER_SHARE');
  }
```

Add `'WITHHOLDING_EXCEEDS_PARTNER_SHARE'` to `SplitFlag`, and both figures to the returned `CommissionSplit`. Note `pct` takes whole percent; since the rates are stored in bps, pass `bps / 100` or add a bps-native helper rather than double-converting.

- [ ] **Step 3: Thread it through the snapshot**

In `commission-snapshot.ts`, add `withholding?: WithholdingSnapshot` to `CommissionSnapshot`, and in `snapshotToRates`:

```ts
    withholdingVatBps: snapshot.withholding?.vatBps ?? 0,
    withholdingPitBps: snapshot.withholding?.pitBps ?? 0,
```

Optional, defaulting to 0, so every booking created before this feature replays exactly as it does today.

- [ ] **Step 4: Verify the arithmetic by hand against the worked example**

Run the split for a 280,000 booking with `vatBps 500 / vatMethod percentage / withholdingVatBps 500 / withholdingPitBps 200`:

Expected: `partnerShare` **240,100** (unchanged from today), `partnerVatWithheld` **14,000**, `partnerPitWithheld` **5,600**, and
`240,100 + 5,320 + 34,580 == 280,000` still holds.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/shared/domain/commission
git commit -m "feat(api): carve NĐ 117 withholding out of the partner's share"
```

---

### Task 4: Resolve and freeze at booking time

**Files:**
- Create: `apps/api/src/modules/finance/domain/ports/withholding-rate-repository.port.ts`
- Create: `apps/api/src/modules/finance/infrastructure/repositories/prisma-withholding-rate.repository.ts`
- Create: `apps/api/src/modules/finance/application/use-cases/resolve-withholding.use-case.ts`
- Modify: `apps/api/src/modules/finance/application/use-cases/resolve-commission.use-case.ts`
- Modify: `apps/api/src/modules/finance/infrastructure/http/finance.module.ts`

**Interfaces:**
- Produces: `WITHHOLDING_RATE_REPOSITORY`, `IWithholdingRateRepository.list(tx)`, `ResolveWithholdingUseCase.execute(tx, { partnerId, serviceDate }): Promise<WithholdingSnapshot>`.

Mirror `ResolveTaxUseCase` exactly — same shape, same gating, same "any miss falls back to none rather than guessing". `ResolveCommissionUseCase` then freezes `withholding` beside `tax` in the one snapshot both replay paths already thread.

- [ ] **Step 1: Port and repository** — copy the shape of `tax-rate-repository.port.ts` and `prisma-tax-rate.repository.ts`, reading `withholding_rates`.

- [ ] **Step 2: The use-case**

```ts
  async execute(tx: PrismaTx, target: ResolveWithholdingTarget): Promise<WithholdingSnapshot> {
    const none = noWithholding(target.serviceDate);
    const partner = await tx.partner.findUnique({
      where: { id: target.partnerId },
      select: { isHouse: true, taxStatus: true },
    });
    // House inventory is the tenant's own; there is no third party to withhold from.
    if (!partner || partner.isHouse || !partnerIsWithheld(partner.taxStatus)) return none;

    const rate = selectWithholdingRate(await this.rates.list(tx), 'service', target.serviceDate);
    if (!rate) return none;
    return {
      rateId: rate.id,
      activity: rate.activity,
      vatBps: rate.vatBps,
      pitBps: rate.pitBps,
      legalRef: rate.legalRef,
      resolvedFor: target.serviceDate.toISOString(),
    };
  }
```

- [ ] **Step 3: Freeze it in `ResolveCommissionUseCase`** beside the existing `tax` field, using the same `serviceDate`.

- [ ] **Step 4: Register both in `finance.module.ts`** (provider + the repository binding), and export the use-case only if another module needs it — it does not today.

- [ ] **Step 5: Verify**

```bash
pnpm --filter=@booking/api typecheck && pnpm --filter=@booking/api lint && pnpm check:module-cycles
```

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/finance
git commit -m "feat(api): resolve and freeze NĐ 117 withholding at booking time"
```

---

### Task 5: Ledger legs and a smaller payable

**Files:**
- Modify: `apps/api/src/modules/finance/domain/entities/ledger-journal.entity.ts`
- Modify: `apps/api/src/modules/finance/domain/entities/settlement.entity.ts`
- Modify: `apps/api/src/modules/finance/domain/ports/settlement-repository.port.ts` (`ReleaseAmounts`)

**Interfaces:**
- Consumes: `CommissionSplit.partnerVatWithheld` / `.partnerPitWithheld` (Task 3).
- Produces: `ReleaseAmounts` gains both; the revenue journal gains two legs.

**This is the task that moves real money.** `ledger_entries` are immutable, so a wrong leg can only be corrected by a reversing entry. Get the direction right: the partner's share is credited in full as before, then **debited** back by the withheld amount, with the matching credit sitting on the tenant as a liability to the state.

- [ ] **Step 1: Add the legs to the revenue journal**

Where `LedgerJournal.revenue` builds its legs, after the partner leg:

```ts
    // The partner is still credited its full share; the withholding is a debit
    // back against that payable, with the liability credited to the tenant, who
    // remits it. Two balanced pairs, so the journal totals are unchanged.
    if (split.partnerVatWithheld > 0n) {
      legs.push(
        { entryType: 'vat_withheld', ownerType: 'partner', ownerId: partnerId, debit: split.partnerVatWithheld, credit: 0n },
        { entryType: 'vat_withheld', ownerType: 'tenant', ownerId: null, debit: 0n, credit: split.partnerVatWithheld },
      );
    }
    if (split.partnerPitWithheld > 0n) {
      legs.push(
        { entryType: 'pit_withheld', ownerType: 'partner', ownerId: partnerId, debit: split.partnerPitWithheld, credit: 0n },
        { entryType: 'pit_withheld', ownerType: 'tenant', ownerId: null, debit: 0n, credit: split.partnerPitWithheld },
      );
    }
```

Match the file's actual `JournalLeg` shape — read it first; if legs are built through a helper rather than object literals, use the helper.

- [ ] **Step 2: Net the payable in `settlement.entity.ts`**

Everywhere `partnerPayable` is computed (`startCompletionWindow`, `startNoShowWindow`, `releasePlan`):

```ts
        partnerPayable: max0(
          split.partnerShare - onsiteCollectedAmount - split.partnerVatWithheld - split.partnerPitWithheld,
        ),
```

and carry both figures into `ReleaseAmounts` so they persist onto the settlement row.

- [ ] **Step 3: Verify every journal still balances**

```bash
docker compose exec -T postgres psql -U postgres -d booking -c \
  "SELECT journal_id, SUM(debit) d, SUM(credit) c FROM ledger_entries
     GROUP BY journal_id HAVING SUM(debit) <> SUM(credit);"
```

Expected: **0 rows**. A single unbalanced journal means the legs are wrong; stop and fix before going further.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/finance
git commit -m "feat(api): record NĐ 117 withholding on the ledger and net the payable"
```

---

### Task 6: Seed the schedule and a withheld demo partner

**Files:**
- Create: `apps/api/prisma/seed/withholding-rates.ts`
- Modify: `apps/api/prisma/seed.ts`
- Modify: `apps/api/prisma/seed/demo/studio-demo.ts`

- [ ] **Step 1: Seed the schedule** — one `service` row at `vatBps 500 / pitBps 200`, `legalRef: 'NĐ 117/2025/NĐ-CP'`, called from `seed.ts` beside `seedTaxRates`, idempotent on `(activity, effectiveFrom)`. It is legal constants, so it runs in **every** scope including production.

- [ ] **Step 2: Give the demo a withheld partner**

No seeded partner is `household_declaring` today, so the withholding branch would never run. Set `trang-makeup` to `household_declaring` — on **both** upsert branches, since a field set only on `create` never converges on an existing database. Note in the seed comment that this also moves it off the 0%-VAT branch, so the exempt case loses its only partner; if that case still needs cover, add a fourth demo partner rather than reusing this one.

- [ ] **Step 3: Reseed and verify**

```bash
pnpm --filter=@booking/api seed
docker compose exec -T postgres psql -U postgres -d booking -c \
  "SELECT activity, vat_bps, pit_bps, legal_ref FROM withholding_rates;
   SELECT slug, tax_status FROM partners ORDER BY slug;"
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/prisma
git commit -m "feat(api): seed the NĐ 117 schedule and a withheld demo partner"
```

---

### Task 7: Verify the money end to end

**Files:** none — verification only.

- [ ] **Step 1: Full static check**

```bash
pnpm check:no-tests && pnpm check:module-cycles && pnpm check:frontend-structure \
  && pnpm check:theme-tokens && pnpm --filter=@booking/storefront security \
  && pnpm turbo lint typecheck build && pnpm --filter=@booking/api check:rls
```

- [ ] **Step 2: Run a booking on the withheld partner**

Use the driver described in `2026-08-11-money-flow-results.md`: book 280,000 on a `trang-makeup` listing, pay, complete, release.

Expected on the settlement:

| Field | Value |
| --- | --- |
| `partner_gross_earning` | 240,100 |
| `partner_vat_withheld` | 14,000 |
| `partner_pit_withheld` | 5,600 |
| `partner_payable` | **220,500** |
| `platform_fee` | 5,320 |
| `tenant_net_earning` | 34,580 |

And `partner_gross_earning + platform_fee + tenant_net_earning == 280,000` — the withholding must not have changed the split, only what is paid out.

- [ ] **Step 3: Confirm a company partner is untouched**

Run the same booking on `giang-studio` (`company_vat`). Expected: both withheld columns **0**, `partner_payable` exactly as before this plan. A regression here means the gating is wrong.

- [ ] **Step 4: Confirm the ledger**

Zero unbalanced journals across the database, and the withheld booking carries a `vat_withheld` and a `pit_withheld` pair each summing to zero.

- [ ] **Step 5: Update the docs**

Extend `docs/features/vat.md` with a withholding section: who is withheld from, that the 5% VAT withheld *is* the household's percentage-method obligation rather than a second tax, the three assumptions this plan was built on, and that remittance itself is still manual.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "docs: record the NĐ 117 withholding flow"
```

---

## Explicitly out of scope

- **Remitting the money.** This records the liability; paying the tax authority is a manual finance task. A "withholding due" report for the tenant is the natural follow-up.
- **Chứng từ khấu trừ.** The partner is legally entitled to a withholding certificate; generating one belongs with e-invoicing.
- **Annual reconciliation** against the 200M ₫ threshold.
- **Partner-facing UI** explaining the deduction — the payout statement will simply show a smaller number until this is built, which is worth fixing before any real household partner is onboarded.
- **Goods and transport rates.** Stored but unused; a vertical that sells goods adds one row.
