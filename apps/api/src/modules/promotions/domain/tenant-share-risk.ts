/**
 * Promo × commission tenant-share risk (TONG-QUAN.md §12.4). A `funded_by = tenant`
 * discount is absorbed out of the tenant's commission, so a generous code can push
 * the tenant's net share negative. The spec's rule of thumb:
 *
 *   the tenant share risks going negative when `discount% + platform% + affiliate% > tenant%`.
 *
 * That approximation over-counts because platform/affiliate bite on the *discounted*
 * `final_amount`. Working it through for a tenant-funded discount (fractions of the
 * pre-discount total T, d = discount, p = platform, a = affiliate, t = tenant):
 *
 *   tenantNet = t·T − p·T(1−d) − a·T(1−d) − d·T  =  T·[ t − (p+a)(1−d) − d ]
 *
 * so the tenant share is **certainly negative** when `t < d + p + a − (p+a)·d`, while
 * `t < d + p + a` (the simple sum) is only a *warning* band above it. All legs must be
 * percent to compare on rates alone; a `fixed` discount/rate needs the concrete order
 * amount and is therefore only checked by the booking-time split invariant (§13.1).
 */
export type TenantShareVerdict =
  | { decision: 'ok' }
  | { decision: 'warn'; reason: string }
  | { decision: 'block'; reason: string };

export interface TenantShareRiskInput {
  fundedBy: 'tenant' | 'partner';
  discountType: 'percent' | 'fixed';
  /** `percent`: whole percent. `fixed`: VND đồng. */
  discountValue: number;
  tenantRateType: 'percent' | 'fixed';
  /** Whole percent when `tenantRateType === 'percent'`. */
  tenantRate: number;
  /** Platform fee, whole percent. */
  platformRate: number;
  affiliateRateType: 'percent' | 'fixed';
  /** Whole percent when `affiliateRateType === 'percent'`. */
  affiliateRate: number;
}

const REASON =
  'A tenant-funded discount this large can push the tenant commission share negative (§12.4): discount% + platform% + affiliate% approaches/exceeds tenant%.';

/**
 * Classify the tenant-share risk of a `funded_by = tenant` promotion against the
 * tenant's commission rates. `block` = certain to go negative, `warn` = within the
 * approximation band, `ok` = safe or not assessable on rates alone.
 */
export function evaluateTenantShareRisk(input: TenantShareRiskInput): TenantShareVerdict {
  // A partner-funded discount comes out of the partner's revenue, not the tenant's share.
  if (input.fundedBy !== 'tenant') return { decision: 'ok' };
  // Only a fully-percent combination is comparable without a concrete order amount.
  if (input.discountType !== 'percent' || input.tenantRateType !== 'percent' || input.affiliateRateType !== 'percent') {
    return { decision: 'ok' };
  }

  const d = input.discountValue;
  const p = input.platformRate;
  const a = input.affiliateRate;
  const t = input.tenantRate;

  // Certain: 100·t < 100·(d + p + a) − (p + a)·d  (the exact negativity threshold).
  if (100 * t < 100 * (d + p + a) - (p + a) * d) return { decision: 'block', reason: REASON };
  // Warning band: the simple approximation trips but the exact threshold does not.
  if (t < d + p + a) return { decision: 'warn', reason: REASON };
  return { decision: 'ok' };
}
