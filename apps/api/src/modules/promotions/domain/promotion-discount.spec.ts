import { describe, expect, it } from 'vitest';
import {
  checkApplicability,
  computeDiscount,
  evaluatePromo,
  scopeMatches,
  type PromotionSpec,
} from './promotion-discount';

const NOW = new Date('2026-06-01T00:00:00.000Z');

function promo(overrides: Partial<PromotionSpec> = {}): PromotionSpec {
  return {
    id: 'p1',
    code: 'SAVE',
    discountType: 'percent',
    discountValue: 10n,
    maxDiscount: null,
    appliesTo: 'all',
    appliesToId: null,
    minOrderAmount: null,
    usageLimitTotal: null,
    redeemedCount: 0,
    startsAt: null,
    endsAt: null,
    status: 'active',
    ...overrides,
  };
}

describe('computeDiscount', () => {
  it('percent applies a whole-percent discount', () => {
    expect(computeDiscount(promo({ discountValue: 10n }), 2_000_000n)).toBe(200_000n);
  });

  it('percent respects the max discount cap', () => {
    expect(computeDiscount(promo({ discountValue: 50n, maxDiscount: 100_000n }), 2_000_000n)).toBe(100_000n);
  });

  it('percent rounds half up', () => {
    // 10% of 12,345 = 1234.5 → 1235
    expect(computeDiscount(promo({ discountValue: 10n }), 12_345n)).toBe(1_235n);
  });

  it('fixed is a flat amount', () => {
    expect(computeDiscount(promo({ discountType: 'fixed', discountValue: 150_000n }), 2_000_000n)).toBe(150_000n);
  });

  it('fixed never exceeds the order amount', () => {
    expect(computeDiscount(promo({ discountType: 'fixed', discountValue: 5_000_000n }), 2_000_000n)).toBe(2_000_000n);
  });

  it('returns zero for a non-positive order', () => {
    expect(computeDiscount(promo(), 0n)).toBe(0n);
  });
});

describe('scopeMatches', () => {
  it('all matches any listing', () => {
    expect(scopeMatches(promo({ appliesTo: 'all' }), 'L1')).toBe(true);
  });

  it('listing matches only its target', () => {
    expect(scopeMatches(promo({ appliesTo: 'listing', appliesToId: 'L1' }), 'L1')).toBe(true);
    expect(scopeMatches(promo({ appliesTo: 'listing', appliesToId: 'L2' }), 'L1')).toBe(false);
  });

  it('Phase-2 scopes never match in Phase 1', () => {
    expect(scopeMatches(promo({ appliesTo: 'category', appliesToId: 'C1' }), 'L1')).toBe(false);
  });
});

describe('checkApplicability', () => {
  const ctx = { listingId: 'L1', amount: 1_000_000n, now: NOW };

  it('accepts an active, in-window, in-scope code', () => {
    expect(checkApplicability(promo(), ctx)).toBeNull();
  });

  it('rejects a non-active code', () => {
    expect(checkApplicability(promo({ status: 'paused' }), ctx)).toBe('PROMO_NOT_APPLICABLE');
    expect(checkApplicability(promo({ status: 'ended' }), ctx)).toBe('PROMO_NOT_APPLICABLE');
  });

  it('rejects a not-yet-started code as expired', () => {
    expect(checkApplicability(promo({ startsAt: new Date('2026-07-01T00:00:00Z') }), ctx)).toBe('PROMO_EXPIRED');
  });

  it('rejects a past-end code as expired', () => {
    expect(checkApplicability(promo({ endsAt: new Date('2026-05-01T00:00:00Z') }), ctx)).toBe('PROMO_EXPIRED');
  });

  it('rejects when the usage limit is reached', () => {
    expect(checkApplicability(promo({ usageLimitTotal: 5, redeemedCount: 5 }), ctx)).toBe('PROMO_LIMIT_REACHED');
  });

  it('rejects an order below the minimum', () => {
    expect(checkApplicability(promo({ minOrderAmount: 2_000_000n }), ctx)).toBe('PROMO_MIN_ORDER');
  });

  it('rejects an out-of-scope listing', () => {
    expect(checkApplicability(promo({ appliesTo: 'listing', appliesToId: 'L2' }), ctx)).toBe('PROMO_NOT_APPLICABLE');
  });
});

describe('evaluatePromo', () => {
  it('returns the discount and final amount when valid', () => {
    const result = evaluatePromo(promo({ discountValue: 10n }), { listingId: 'L1', amount: 2_000_000n, now: NOW });
    expect(result).toEqual({ ok: true, discountAmount: 200_000n, finalAmount: 1_800_000n });
  });

  it('surfaces the rejection code when invalid', () => {
    const result = evaluatePromo(promo({ minOrderAmount: 5_000_000n }), { listingId: 'L1', amount: 1_000_000n, now: NOW });
    expect(result).toEqual({ ok: false, rejection: 'PROMO_MIN_ORDER' });
  });
});
