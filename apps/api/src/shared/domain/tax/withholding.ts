import type { PartnerTaxStatus } from './tax';

/**
 * NĐ 117/2025 withholding is a collection of the household seller's obligation
 * at source. It reduces the partner payable and creates a tenant liability; it
 * never changes the customer price or the tenant's earnings.
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
 * Companies invoice and declare for themselves. Every household/individual is
 * withheld from, including a below-threshold seller whose 0% sale rate means the
 * provisional withholding may later be reclaimed at annual settlement.
 */
export function partnerIsWithheld(status: PartnerTaxStatus): boolean {
  return status !== 'company_vat';
}

/** The rate in force for an activity at the service instant. */
export function selectWithholdingRate(
  rates: WithholdingRateCandidate[],
  activity: string,
  at: Date,
): WithholdingRateCandidate | null {
  const applicable = rates.filter(
    (rate) =>
      rate.activity === activity &&
      at >= rate.effectiveFrom &&
      (rate.effectiveTo === null || at < rate.effectiveTo),
  );
  if (applicable.length === 0) return null;
  return applicable.reduce((best, rate) => (rate.effectiveFrom > best.effectiveFrom ? rate : best));
}

/** Frozen beside VAT so the payout calculation can be replayed exactly. */
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
