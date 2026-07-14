import { describe, expect, it } from 'vitest';
import {
  checkApplicability,
  computeDiscount,
  evaluatePromo,
  scopeMatches,
  selectBestAutoCampaign,
  timeWindowMatches,
  type PromoContext,
  type PromotionSpec,
} from './promotion-discount';

const NOW = new Date('2026-06-01T00:00:00.000Z');
const TZ = 'Asia/Ho_Chi_Minh'; // UTC+7, no DST

function promo(overrides: Partial<PromotionSpec> = {}): PromotionSpec {
  return {
    id: 'p1',
    code: 'SAVE',
    discountType: 'percent',
    discountValue: 10n,
    maxDiscount: null,
    fundedBy: 'tenant',
    appliesTo: 'all',
    appliesToId: null,
    minOrderAmount: null,
    firstBookingOnly: false,
    usageLimitTotal: null,
    usageLimitPerCustomer: null,
    timeWindows: null,
    redeemedCount: 0,
    startsAt: null,
    endsAt: null,
    status: 'active',
    partnerOptInAt: null,
    ...overrides,
  };
}

function ctx(overrides: Partial<PromoContext> = {}): PromoContext {
  return {
    listingId: 'L1',
    listingTypeId: 'T1',
    groupId: 'G1',
    categoryId: 'C1',
    partnerId: 'PA1',
    amount: 1_000_000n,
    now: NOW,
    slotStart: null,
    timezone: TZ,
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

describe('scopeMatches (all 6 scopes)', () => {
  it('all matches any listing', () => {
    expect(scopeMatches(promo({ appliesTo: 'all' }), ctx())).toBe(true);
  });

  it('listing matches only its target', () => {
    expect(scopeMatches(promo({ appliesTo: 'listing', appliesToId: 'L1' }), ctx())).toBe(true);
    expect(scopeMatches(promo({ appliesTo: 'listing', appliesToId: 'L2' }), ctx())).toBe(false);
  });

  it('listing_type matches the listing type', () => {
    expect(scopeMatches(promo({ appliesTo: 'listing_type', appliesToId: 'T1' }), ctx())).toBe(true);
    expect(scopeMatches(promo({ appliesTo: 'listing_type', appliesToId: 'T2' }), ctx())).toBe(false);
  });

  it('listing_group matches the parent group (never a null group)', () => {
    expect(scopeMatches(promo({ appliesTo: 'listing_group', appliesToId: 'G1' }), ctx())).toBe(true);
    expect(scopeMatches(promo({ appliesTo: 'listing_group', appliesToId: 'G1' }), ctx({ groupId: null }))).toBe(false);
  });

  it('category matches the listing category (never a null category)', () => {
    expect(scopeMatches(promo({ appliesTo: 'category', appliesToId: 'C1' }), ctx())).toBe(true);
    expect(scopeMatches(promo({ appliesTo: 'category', appliesToId: 'C1' }), ctx({ categoryId: null }))).toBe(false);
  });

  it('partner matches the owning partner', () => {
    expect(scopeMatches(promo({ appliesTo: 'partner', appliesToId: 'PA1' }), ctx())).toBe(true);
    expect(scopeMatches(promo({ appliesTo: 'partner', appliesToId: 'PA2' }), ctx())).toBe(false);
  });
});

describe('timeWindowMatches (off-peak)', () => {
  // 2026-06-05 is a Friday (weekday 5). 19:00 local (UTC+7) = 12:00 UTC.
  const fridayEvening = new Date('2026-06-05T12:00:00.000Z');
  const fridayMorning = new Date('2026-06-05T02:00:00.000Z'); // 09:00 local

  it('is always true when no windows are configured', () => {
    expect(timeWindowMatches(null, null, TZ)).toBe(true);
    expect(timeWindowMatches([], fridayMorning, TZ)).toBe(true);
  });

  it('matches a slot inside a day+time window', () => {
    const windows = [{ days: [5, 6], from: '18:00', to: '22:00' }];
    expect(timeWindowMatches(windows, fridayEvening, TZ)).toBe(true);
  });

  it('rejects a slot outside the time window', () => {
    const windows = [{ days: [5], from: '18:00', to: '22:00' }];
    expect(timeWindowMatches(windows, fridayMorning, TZ)).toBe(false);
  });

  it('rejects a slot on a non-listed day', () => {
    const windows = [{ days: [0], from: '18:00', to: '22:00' }]; // Sunday only
    expect(timeWindowMatches(windows, fridayEvening, TZ)).toBe(false);
  });

  it('cannot confirm when windows are configured but the slot is unknown', () => {
    expect(timeWindowMatches([{ days: [5], from: '18:00', to: '22:00' }], null, TZ)).toBe(false);
  });
});

describe('checkApplicability', () => {
  it('accepts an active, in-window, in-scope code', () => {
    expect(checkApplicability(promo(), ctx())).toBeNull();
  });

  it('rejects a non-active code', () => {
    expect(checkApplicability(promo({ status: 'paused' }), ctx())).toBe('PROMO_NOT_APPLICABLE');
    expect(checkApplicability(promo({ status: 'ended' }), ctx())).toBe('PROMO_NOT_APPLICABLE');
  });

  it('rejects a not-yet-started code as expired', () => {
    expect(checkApplicability(promo({ startsAt: new Date('2026-07-01T00:00:00Z') }), ctx())).toBe('PROMO_EXPIRED');
  });

  it('rejects a past-end code as expired', () => {
    expect(checkApplicability(promo({ endsAt: new Date('2026-05-01T00:00:00Z') }), ctx())).toBe('PROMO_EXPIRED');
  });

  it('rejects when the total usage limit is reached', () => {
    expect(checkApplicability(promo({ usageLimitTotal: 5, redeemedCount: 5 }), ctx())).toBe('PROMO_LIMIT_REACHED');
  });

  it('rejects an order below the minimum', () => {
    expect(checkApplicability(promo({ minOrderAmount: 2_000_000n }), ctx())).toBe('PROMO_MIN_ORDER');
  });

  it('rejects an out-of-scope listing', () => {
    expect(checkApplicability(promo({ appliesTo: 'listing', appliesToId: 'L2' }), ctx())).toBe('PROMO_NOT_APPLICABLE');
  });

  it('gates a partner-funded promo until the partner opts in', () => {
    expect(checkApplicability(promo({ fundedBy: 'partner', partnerOptInAt: null }), ctx())).toBe('PROMO_NOT_OPTED_IN');
    expect(checkApplicability(promo({ fundedBy: 'partner', partnerOptInAt: NOW }), ctx())).toBeNull();
  });

  it('rejects a slot outside an off-peak window', () => {
    const windows = [{ days: [0], from: '18:00', to: '22:00' }]; // Sunday only
    const fridayEvening = new Date('2026-06-05T12:00:00.000Z');
    expect(checkApplicability(promo({ timeWindows: windows }), ctx({ slotStart: fridayEvening }))).toBe(
      'PROMO_TIME_WINDOW',
    );
  });

  it('enforces first-booking-only when the customer has prior bookings', () => {
    expect(checkApplicability(promo({ firstBookingOnly: true }), ctx({ customerPriorBookings: 1 }))).toBe(
      'PROMO_FIRST_BOOKING_ONLY',
    );
    expect(checkApplicability(promo({ firstBookingOnly: true }), ctx({ customerPriorBookings: 0 }))).toBeNull();
  });

  it('skips first-booking-only when the customer is unknown (preview)', () => {
    expect(checkApplicability(promo({ firstBookingOnly: true }), ctx())).toBeNull();
  });

  it('enforces the per-customer usage limit', () => {
    expect(checkApplicability(promo({ usageLimitPerCustomer: 2 }), ctx({ customerRedemptions: 2 }))).toBe(
      'PROMO_LIMIT_REACHED',
    );
    expect(checkApplicability(promo({ usageLimitPerCustomer: 2 }), ctx({ customerRedemptions: 1 }))).toBeNull();
  });
});

describe('evaluatePromo', () => {
  it('returns the discount and final amount when valid', () => {
    const result = evaluatePromo(promo({ discountValue: 10n }), ctx({ amount: 2_000_000n }));
    expect(result).toEqual({ ok: true, discountAmount: 200_000n, finalAmount: 1_800_000n });
  });

  it('surfaces the rejection code when invalid', () => {
    const result = evaluatePromo(promo({ minOrderAmount: 5_000_000n }), ctx({ amount: 1_000_000n }));
    expect(result).toEqual({ ok: false, rejection: 'PROMO_MIN_ORDER' });
  });
});

describe('selectBestAutoCampaign (no-stacking / priority)', () => {
  const campaign = (id: string, overrides: Partial<PromotionSpec> = {}): PromotionSpec =>
    promo({ id, code: null, ...overrides });

  it('returns null when there are no campaigns', () => {
    expect(selectBestAutoCampaign([], ctx())).toBeNull();
  });

  it('ignores code-bearing promotions (only auto-campaigns are auto-applied)', () => {
    const withCode = promo({ id: 'c1', code: 'SAVE', discountType: 'fixed', discountValue: 500_000n });
    expect(selectBestAutoCampaign([withCode], ctx())).toBeNull();
  });

  it('picks the campaign giving the largest actual discount', () => {
    const small = campaign('c1', { discountType: 'fixed', discountValue: 100_000n });
    const big = campaign('c2', { discountType: 'fixed', discountValue: 300_000n });
    const result = selectBestAutoCampaign([small, big], ctx({ amount: 1_000_000n }));
    expect(result?.promo.id).toBe('c2');
    expect(result?.discountAmount).toBe(300_000n);
    expect(result?.finalAmount).toBe(700_000n);
  });

  it('skips inapplicable campaigns (scope, window, opt-in)', () => {
    const outOfScope = campaign('c1', { appliesTo: 'listing', appliesToId: 'OTHER', discountValue: 90n });
    const notOptedIn = campaign('c2', { fundedBy: 'partner', partnerOptInAt: null, discountValue: 90n });
    const applicable = campaign('c3', { discountType: 'fixed', discountValue: 50_000n });
    const result = selectBestAutoCampaign([outOfScope, notOptedIn, applicable], ctx({ amount: 1_000_000n }));
    expect(result?.promo.id).toBe('c3');
  });
});
