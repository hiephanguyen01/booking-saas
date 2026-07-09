import type { RateType } from './commission-split';

/**
 * Commission-rule precedence (TONG-QUAN.md §3.2): the most specific effective
 * rule wins — **partner → listing_type / category → tenant_default**. Pure so it
 * is unit-testable without the DB; the repository supplies the candidate rows.
 */
export type CommissionAppliesTo = 'tenant_default' | 'listing_type' | 'category' | 'partner';

export interface CommissionRuleCandidate {
  id: string;
  appliesTo: CommissionAppliesTo;
  listingTypeId: string | null;
  categoryId: string | null;
  partnerId: string | null;
  tenantRateType: RateType;
  tenantRate: bigint;
  platformRate: number;
  affiliateRateType: RateType;
  affiliateRate: bigint;
  effectiveFrom: Date | null;
  effectiveTo: Date | null;
}

export interface RuleTarget {
  partnerId: string;
  listingTypeId: string | null;
  categoryId: string | null;
}

const PRECEDENCE: Record<CommissionAppliesTo, number> = {
  partner: 3,
  listing_type: 2,
  category: 2,
  tenant_default: 1,
};

/** True when the rule is in effect at `now`. */
export function isEffective(rule: CommissionRuleCandidate, now: Date): boolean {
  if (rule.effectiveFrom && now < rule.effectiveFrom) return false;
  if (rule.effectiveTo && now >= rule.effectiveTo) return false;
  return true;
}

/** Whether a rule targets the given booking (partner/type/category or the default). */
export function ruleMatches(rule: CommissionRuleCandidate, target: RuleTarget): boolean {
  switch (rule.appliesTo) {
    case 'partner':
      return rule.partnerId === target.partnerId;
    case 'listing_type':
      return rule.listingTypeId !== null && rule.listingTypeId === target.listingTypeId;
    case 'category':
      return rule.categoryId !== null && rule.categoryId === target.categoryId;
    case 'tenant_default':
      return true;
  }
}

/**
 * Select the applicable rule: highest precedence among effective, matching rules;
 * ties broken by the most recent `effectiveFrom`. Returns null when none applies.
 */
export function selectCommissionRule(
  rules: CommissionRuleCandidate[],
  target: RuleTarget,
  now: Date,
): CommissionRuleCandidate | null {
  const applicable = rules.filter((r) => isEffective(r, now) && ruleMatches(r, target));
  if (applicable.length === 0) return null;
  return applicable.reduce((best, r) => {
    const bp = PRECEDENCE[best.appliesTo];
    const rp = PRECEDENCE[r.appliesTo];
    if (rp !== bp) return rp > bp ? r : best;
    const bf = best.effectiveFrom?.getTime() ?? 0;
    const rf = r.effectiveFrom?.getTime() ?? 0;
    return rf > bf ? r : best;
  });
}
