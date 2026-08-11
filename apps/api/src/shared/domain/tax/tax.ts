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
 * A household under the 200M VND/year threshold (Luật 48/2024/QH15) and a
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
