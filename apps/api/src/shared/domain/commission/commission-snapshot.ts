import type { CommissionRates, RateType } from './commission-split';
import { noTax, type TaxSnapshot } from '../tax/tax';
import { noWithholding, type WithholdingSnapshot } from '../tax/withholding';

/**
 * The immutable commission configuration captured on a booking at creation time
 * (`bookings.commission_snapshot`). Replaying the split from this — never the live
 * rule — is what makes a later rule change invisible to past bookings (§13.1).
 * Money is serialised as a VND đồng string so the JSON snapshot round-trips exactly.
 */
export interface CommissionSnapshot {
  /** The resolved rule id, or null when the tenant had no matching rule. */
  ruleId: string | null;
  appliesTo: 'tenant_default' | 'listing_type' | 'category' | 'partner' | 'none';
  tenantRateType: RateType;
  tenantRate: string;
  platformRate: number;
  affiliateRateType: RateType;
  affiliateRate: string;
  isHouse: boolean;
  /**
   * Frozen VAT context (§VAT). Optional: a booking created before dynamic VAT has
   * none, and must keep behaving exactly as it did — `snapshotToRates` reads it
   * as `vatBps: 0`, which makes every rate fall back to the gross base.
   */
  tax?: TaxSnapshot;
  /** Optional so bookings created before NĐ 117 replay with no withholding. */
  withholding?: WithholdingSnapshot;
}

/** A safe zero-commission snapshot (partner keeps everything) when no rule matches. */
export function defaultCommissionSnapshot(
  isHouse: boolean,
  at: Date = new Date(),
): CommissionSnapshot {
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
    withholding: noWithholding(at),
  };
}

/** Parse a stored snapshot into the numeric rates the split maths expects. */
export function snapshotToRates(snapshot: CommissionSnapshot): CommissionRates {
  return {
    tenantRateType: snapshot.tenantRateType,
    tenantRate: BigInt(snapshot.tenantRate),
    platformRate: snapshot.platformRate,
    affiliateRateType: snapshot.affiliateRateType,
    affiliateRate: BigInt(snapshot.affiliateRate),
    isHouse: snapshot.isHouse,
    vatBps: snapshot.tax?.vatBps ?? 0,
    // Pre-regime bookings were all deduction-method sellers, so that is the safe
    // default — it also reproduces their original arithmetic exactly.
    vatMethod: snapshot.tax?.method ?? 'deduction',
    withholdingVatBps: snapshot.withholding?.vatBps ?? 0,
    withholdingPitBps: snapshot.withholding?.pitBps ?? 0,
  };
}
