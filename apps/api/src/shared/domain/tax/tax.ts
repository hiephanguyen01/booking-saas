import { percentOfBps, vatFromGross, type Vnd } from '../../money/money';

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
export type TaxCategory =
  | 'standard'
  | 'reduced_5'
  | 'exempt'
  | 'not_taxable'
  | 'percentage_service';

/**
 * The two Vietnamese VAT regimes. They are mutually exclusive and chosen by WHO
 * sells, not by what is sold:
 *
 * - `deduction` (khấu trừ) — enterprises. 8%/10%, **contained in** a gross price,
 *   input VAT deductible.
 * - `percentage` (tỷ lệ % trên doanh thu) — households that declare. A flat 5%
 *   for services applied **straight to revenue**, no input deduction.
 *
 * They differ in the arithmetic as well as the rate, which is why this rides on
 * the snapshot: on 280,000 ₫ the deduction method yields 20,741 and the
 * percentage method 14,000. Treating a household as an 8% enterprise — as this
 * did until 2026-08-11 — is wrong on both counts.
 */
export type TaxMethod = 'deduction' | 'percentage';

/** Structurally identical to Prisma's generated `PartnerTaxStatus` enum. */
export type PartnerTaxStatus =
  | 'company_vat'
  | 'household_declaring'
  | 'household_below_threshold'
  | 'individual';

/**
 * Only a VAT-registered company or a declaring household charges output VAT.
 * A household under the 200M VND/year threshold (Luật 48/2024/QH15) and a
 * non-business individual both resolve to 0% regardless of listing type.
 */
export function partnerChargesVat(status: PartnerTaxStatus): boolean {
  return status === 'company_vat' || status === 'household_declaring';
}

/**
 * Which regime a seller is on. A declaring household is NOT an 8% enterprise —
 * see {@link TaxMethod}. Callers must only use this once
 * {@link partnerChargesVat} has said the seller charges VAT at all.
 */
export function taxMethodFor(status: PartnerTaxStatus): TaxMethod {
  return status === 'company_vat' ? 'deduction' : 'percentage';
}

/**
 * The one category a `percentage`-method seller uses. The method has other rates
 * (goods 1%, transport 3%), but everything sold through a booking platform is a
 * service, and the rate follows the SELLER's regime rather than the listing
 * type's classification.
 */
export const PERCENTAGE_METHOD_CATEGORY: TaxCategory = 'percentage_service';

/**
 * VAT on a gross amount under the seller's own regime.
 *
 * `deduction` extracts the tax already inside the price; `percentage` applies the
 * rate straight to revenue. Using the wrong one silently misstates every leg
 * downstream, since the commission base is the amount net of this.
 */
export function vatOf(gross: Vnd, bps: number, method: TaxMethod): Vnd {
  if (bps === 0 || gross <= 0n) return 0n;
  return method === 'percentage' ? percentOfBps(gross, bps) : vatFromGross(gross, bps);
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
  /**
   * Which regime produced `vatBps`. Frozen because the arithmetic differs, so a
   * booking replayed years later must use the method that applied on the day.
   * Optional for bookings created before the two regimes were separated; those
   * were all deduction-method sellers.
   */
  method?: TaxMethod;
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
    method: 'deduction',
    legalRef: null,
    resolvedFor: resolvedFor.toISOString(),
  };
}
