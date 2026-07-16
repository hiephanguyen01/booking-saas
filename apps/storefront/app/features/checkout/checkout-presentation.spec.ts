import { describe, expect, it } from 'vitest';
import { checkoutAmounts, policyLines } from './checkout-presentation';

describe('checkout presentation', () => {
  it('keeps VND calculations exact when applying a proportional promo deposit', () => {
    expect(
      checkoutAmounts(
        { subtotal: '1000001', depositAmount: '500001', securityDeposit: '200000' },
        { discountAmount: '200001', finalAmount: '800000' },
      ),
    ).toEqual({
      subtotal: '1000001',
      discount: '200001',
      finalAmount: '800000',
      dueNow: '600000',
    });
  });

  it('reduces real cancellation tiers to translatable lines, widest window first', () => {
    expect(
      policyLines({
        id: 'policy-1',
        name: 'Linh hoạt',
        rules: [
          { hoursBefore: 48, refundPercent: 50 },
          { hoursBefore: 168, refundPercent: 100 },
          { hoursBefore: 6, refundPercent: 20 },
          { hoursBefore: 0, refundPercent: 0 },
        ],
      }),
    ).toEqual([
      { kind: 'refund', unit: 'day', amount: 7, refundPercent: 100 },
      { kind: 'refund', unit: 'day', amount: 2, refundPercent: 50 },
      { kind: 'refund', unit: 'hour', amount: 6, refundPercent: 20 },
      { kind: 'noRefund' },
    ]);
  });

  it('clamps a refund percent that the API reports outside 0–100', () => {
    expect(
      policyLines({
        id: 'policy-2',
        name: 'Broken',
        rules: [{ hoursBefore: 24, refundPercent: 140 }],
      }),
    ).toEqual([{ kind: 'refund', unit: 'day', amount: 1, refundPercent: 100 }]);
  });

  it('uses a truthful fallback when no cancellation policy is configured', () => {
    expect(policyLines(null)).toEqual([{ kind: 'unspecified' }]);
  });
});
