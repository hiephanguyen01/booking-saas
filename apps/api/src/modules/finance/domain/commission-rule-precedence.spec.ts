import { describe, expect, it } from 'vitest';
import { selectCommissionRule, type CommissionRuleCandidate } from './commission-rule-precedence';

const base = {
  tenantRateType: 'percent' as const,
  tenantRate: 15n,
  platformRate: 2,
  affiliateRateType: 'percent' as const,
  affiliateRate: 5n,
  effectiveFrom: new Date('2026-01-01T00:00:00Z'),
  effectiveTo: null,
};

const def: CommissionRuleCandidate = { id: 'def', appliesTo: 'tenant_default', listingTypeId: null, categoryId: null, partnerId: null, ...base };
const byType: CommissionRuleCandidate = { id: 'type', appliesTo: 'listing_type', listingTypeId: 'lt-1', categoryId: null, partnerId: null, ...base };
const byPartner: CommissionRuleCandidate = { id: 'partner', appliesTo: 'partner', listingTypeId: null, categoryId: null, partnerId: 'p-1', ...base };

const now = new Date('2026-07-01T00:00:00Z');
const target = { partnerId: 'p-1', listingTypeId: 'lt-1', categoryId: 'c-1' };

describe('selectCommissionRule', () => {
  it('partner rule beats listing_type beats tenant_default', () => {
    expect(selectCommissionRule([def, byType, byPartner], target, now)?.id).toBe('partner');
    expect(selectCommissionRule([def, byType], target, now)?.id).toBe('type');
    expect(selectCommissionRule([def], target, now)?.id).toBe('def');
  });

  it('ignores rules that do not match the target', () => {
    const otherPartner = { ...byPartner, id: 'other', partnerId: 'p-2' };
    expect(selectCommissionRule([def, otherPartner], target, now)?.id).toBe('def');
  });

  it('ignores rules outside their effective window', () => {
    const expired = { ...byPartner, id: 'expired', effectiveTo: new Date('2026-06-01T00:00:00Z') };
    expect(selectCommissionRule([def, expired], target, now)?.id).toBe('def');
    const future = { ...byPartner, id: 'future', effectiveFrom: new Date('2026-08-01T00:00:00Z') };
    expect(selectCommissionRule([def, future], target, now)?.id).toBe('def');
  });

  it('returns null when nothing applies', () => {
    expect(selectCommissionRule([], target, now)).toBeNull();
  });

  it('breaks a precedence tie by the most recent effectiveFrom', () => {
    const older = { ...byType, id: 'older', effectiveFrom: new Date('2026-01-01T00:00:00Z') };
    const newer = { ...byType, id: 'newer', effectiveFrom: new Date('2026-05-01T00:00:00Z') };
    expect(selectCommissionRule([older, newer], target, now)?.id).toBe('newer');
  });
});
