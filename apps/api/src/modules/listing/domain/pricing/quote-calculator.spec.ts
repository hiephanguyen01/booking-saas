import { describe, expect, it } from 'vitest';
import type { ModeConfig } from '@booking/shared';
import { wallClockInZone } from '../../../../shared/time/time';
import { computeQuote, type PricingRuleView, type QuoteRequest } from './quote-calculator';

const TZ = 'Asia/Ho_Chi_Minh'; // UTC+7, no DST → local = UTC + 7h

const hourlyConfig: ModeConfig = {
  hourly: {
    basePrice: '300000',
    blocks: [{ hours: 2, price: '500000' }],
    minDuration: 1,
    maxDuration: 8,
    granularity: 60,
    leadTimeMin: 0,
  },
};

const dailyConfig: ModeConfig = {
  daily: {
    basePricePerNight: '1800000',
    blocks: [{ days: 3, price: '5000000' }],
    minNights: 1,
    maxNights: 30,
    checkinTime: '14:00',
    checkoutTime: '12:00',
    leadTimeMin: 0,
  },
};

const inventoryConfig: ModeConfig = {
  inventory: { unit: 'day', basePrice: '800000', securityDeposit: '5000000' },
};

function base(overrides: Partial<QuoteRequest>): QuoteRequest {
  return {
    mode: 'hourly',
    modeConfig: hourlyConfig,
    pricingRules: [],
    timezone: TZ,
    startUtc: new Date('2026-03-10T10:00:00Z'), // 17:00 ICT
    endUtc: new Date('2026-03-10T13:00:00Z'), // 20:00 ICT (3h)
    quantity: 1,
    depositPercent: 100,
    ...overrides,
  };
}

const goldenHour: PricingRuleView = {
  id: 'rule-golden',
  bookingMode: 'hourly',
  ruleType: 'time_range',
  params: { from: '18:00', to: '22:00' },
  price: '400000',
  priority: 10,
};

describe('computeQuote — hourly', () => {
  it('prices base × hours when no block/rule matches', () => {
    const q = computeQuote(base({}));
    expect(q.subtotal).toBe(900_000n); // 3 × 300k
    expect(q.lineItems).toHaveLength(1);
    expect(q.lineItems[0]!.quantity).toBe(3);
  });

  it('uses the block (bundle) price when the duration matches a block', () => {
    const q = computeQuote(
      base({ startUtc: new Date('2026-03-10T11:00:00Z'), endUtc: new Date('2026-03-10T13:00:00Z') }), // 18:00–20:00, 2h
    );
    expect(q.subtotal).toBe(500_000n);
    expect(q.lineItems[0]!.block).toBe(true);
  });

  it('a block price is NOT overridden by a matching pricing rule', () => {
    const q = computeQuote(
      base({
        startUtc: new Date('2026-03-10T11:00:00Z'), // 18:00 ICT (inside golden hour)
        endUtc: new Date('2026-03-10T13:00:00Z'), // 20:00 ICT → 2h block
        pricingRules: [goldenHour],
      }),
    );
    expect(q.subtotal).toBe(500_000n); // block, not 2 × 400k
    expect(q.lineItems[0]!.block).toBe(true);
  });

  it('applies a golden-hour time_range rule only to the hours inside the window', () => {
    // 17:00–20:00 ICT (3h, no 3h block): 17:00 base, 18:00 + 19:00 golden.
    const q = computeQuote(base({ pricingRules: [goldenHour] }));
    expect(q.subtotal).toBe(1_100_000n); // 300k + 400k + 400k
    const golden = q.lineItems.find((l) => l.appliedRuleId === 'rule-golden');
    expect(golden?.quantity).toBe(2);
    expect(golden?.unitPrice).toBe(400_000n);
  });

  it('honours a day_of_week rule and lets the highest priority win', () => {
    const start = new Date('2026-03-10T10:00:00Z');
    const weekday = wallClockInZone(start, TZ).weekday;
    const weekendRule: PricingRuleView = {
      id: 'rule-dow',
      bookingMode: 'hourly',
      ruleType: 'day_of_week',
      params: { days: [weekday] }, // matches this booking's day
      price: '600000',
      priority: 5,
    };
    // day_of_week alone → 600k for all 3 hours
    const only = computeQuote(base({ pricingRules: [weekendRule] }));
    expect(only.subtotal).toBe(1_800_000n); // 3 × 600k

    // golden hour (priority 10) beats the day rule (priority 5) for 18:00 & 19:00
    const both = computeQuote(base({ pricingRules: [weekendRule, goldenHour] }));
    expect(both.subtotal).toBe(1_400_000n); // 600k (17:00) + 400k + 400k
  });
});

describe('computeQuote — daily', () => {
  it('prices per night with a date_range rule', () => {
    const q = computeQuote(
      base({
        mode: 'daily',
        modeConfig: dailyConfig,
        startUtc: new Date('2026-04-01T00:00:00Z'), // ICT date 2026-04-01
        endUtc: new Date('2026-04-03T00:00:00Z'), // 2 nights
        pricingRules: [
          {
            id: 'rule-date',
            bookingMode: 'daily',
            ruleType: 'date_range',
            params: { from: '2026-04-01', to: '2026-04-03' },
            price: '2500000',
            priority: 1,
          },
        ],
      }),
    );
    expect(q.subtotal).toBe(5_000_000n); // 2 × 2.5M
  });

  it('uses a daily block when nights match', () => {
    const q = computeQuote(
      base({
        mode: 'daily',
        modeConfig: dailyConfig,
        startUtc: new Date('2026-04-01T00:00:00Z'),
        endUtc: new Date('2026-04-04T00:00:00Z'), // 3 nights → block
      }),
    );
    expect(q.subtotal).toBe(5_000_000n);
    expect(q.lineItems[0]!.block).toBe(true);
  });
});

describe('computeQuote — inventory & deposit', () => {
  it('prices quantity × duration and keeps the security deposit separate', () => {
    const q = computeQuote(
      base({
        mode: 'inventory',
        modeConfig: inventoryConfig,
        startUtc: new Date('2026-05-01T00:00:00Z'),
        endUtc: new Date('2026-05-04T00:00:00Z'), // 3 days
        quantity: 2,
        depositPercent: 100,
      }),
    );
    expect(q.subtotal).toBe(4_800_000n); // 800k × 2 × 3
    expect(q.securityDeposit).toBe(10_000_000n); // 5M × 2 — never in subtotal
  });

  it('applies a matching pricing rule to the inventory per-unit price by priority', () => {
    // A day_of_week rule matching the rental days replaces the 800k base per unit
    // (§7.3 line 466) — inventory now honours pricing_rules like hourly/daily.
    const start = new Date('2026-05-01T00:00:00Z');
    const weekday = wallClockInZone(start, TZ).weekday;
    const weekendRule: PricingRuleView = {
      id: 'rule-inv-dow',
      bookingMode: 'inventory',
      ruleType: 'day_of_week',
      params: { days: [weekday, (weekday + 1) % 7, (weekday + 2) % 7] },
      price: '1000000',
      priority: 5,
    };
    const q = computeQuote(
      base({
        mode: 'inventory',
        modeConfig: inventoryConfig,
        startUtc: start,
        endUtc: new Date('2026-05-04T00:00:00Z'), // 3 days
        quantity: 2,
        pricingRules: [weekendRule],
      }),
    );
    expect(q.subtotal).toBe(6_000_000n); // 1M × 2 units × 3 days (rule, not 800k base)
    expect(q.securityDeposit).toBe(10_000_000n); // deposit still separate, unscaled by rule
    expect(q.lineItems.every((l) => l.appliedRuleId === 'rule-inv-dow')).toBe(true);
  });

  it('computes the deposit as depositPercent of the subtotal', () => {
    const q = computeQuote(base({ depositPercent: 50 }));
    expect(q.subtotal).toBe(900_000n);
    expect(q.depositAmount).toBe(450_000n);
  });
});
