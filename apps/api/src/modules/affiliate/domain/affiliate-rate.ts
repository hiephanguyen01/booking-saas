import type { RateType } from '../../../shared/domain/commission/commission-split';
import type { CommissionSnapshot } from '../../../shared/domain/commission/commission-snapshot';

/**
 * Resolving the rate an affiliate is actually paid at (§15.2 priority:
 * `custom_rate` > applicable commission rule > nothing configured).
 *
 * `affiliates.custom_rate` is an OVERRIDE and is null for most affiliates, so it
 * is not on its own a renderable rate — the number that matters then lives on the
 * tenant's commission rule. Resolving that fallback server-side (here) is what
 * lets every audience be handed a rate that is always populated, instead of a null
 * plus a "by the rule" label that never names the rule's number.
 *
 * Pure — the caller supplies the rule; no DB, no framework.
 */

export type AffiliateRateSource = 'custom' | 'rule' | 'none';

/** The affiliate leg of a commission rule (`commission_rules.affiliate_rate*`). */
export interface AffiliateRuleRate {
  affiliateRateType: RateType;
  /** `percent`: whole percent (5 = 5%). `fixed`: VND đồng. */
  affiliateRate: bigint;
}

export interface EffectiveAffiliateRate {
  /** `percent`: whole percent. `fixed`: VND đồng. Never negative. */
  rate: bigint;
  rateType: RateType;
  source: AffiliateRateSource;
}

/**
 * The effective affiliate rate for one affiliate under one rule.
 *
 * `custom_rate` is always a whole **percent** — that is the only shape the column
 * can hold and exactly how `applyCustomRate` (below) bakes it
 * into a booking's commission snapshot, so an override always reports as
 * `percent`. With no override the rule's own affiliate leg applies verbatim
 * (it may legitimately be `fixed`). With neither, the affiliate earns nothing —
 * reported as `0` / `none`, never as a fabricated percent.
 */
export function resolveEffectiveAffiliateRate(
  customRate: bigint | null,
  rule: AffiliateRuleRate | null,
): EffectiveAffiliateRate {
  if (customRate !== null) return { rate: customRate, rateType: 'percent', source: 'custom' };
  if (rule !== null) return { rate: rule.affiliateRate, rateType: rule.affiliateRateType, source: 'rule' };
  return { rate: 0n, rateType: 'percent', source: 'none' };
}

/**
 * Bake the affiliate's `custom_rate` into the commission snapshot so BOTH the
 * ledger leg and the tracked `affiliate_commissions` row use the same rate
 * (§15.2 priority: custom_rate > rule rate). `custom_rate` is always a whole
 * percent. When null the snapshot's rule rate is left untouched.
 */
export function applyCustomRate(snapshot: CommissionSnapshot, customRate: bigint | null): CommissionSnapshot {
  if (customRate === null) return snapshot;
  return { ...snapshot, affiliateRateType: 'percent', affiliateRate: customRate.toString() };
}
