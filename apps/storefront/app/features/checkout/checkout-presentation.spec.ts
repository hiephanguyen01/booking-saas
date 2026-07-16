import { describe, expect, it } from 'vitest';
import {
  checkoutAmounts,
  checkoutListingPresentation,
  policyLines,
} from './checkout-presentation';

describe('checkout presentation', () => {
  it('creates stable rating and booking metadata from the listing identity', () => {
    const first = checkoutListingPresentation('listing-1');
    expect(checkoutListingPresentation('listing-1')).toEqual(first);
    expect(first.rating).toBeGreaterThanOrEqual(4.6);
    expect(first.rating).toBeLessThanOrEqual(4.9);
    expect(first.bookingCount).toBeGreaterThan(100);
  });

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

  it('turns real cancellation tiers into customer-facing Vietnamese copy', () => {
    expect(
      policyLines({
        id: 'policy-1',
        name: 'Linh hoạt',
        rules: [
          { hoursBefore: 168, refundPercent: 100 },
          { hoursBefore: 48, refundPercent: 50 },
          { hoursBefore: 0, refundPercent: 0 },
        ],
      }),
    ).toEqual([
      'Hủy trước 7 ngày: hoàn 100%',
      'Hủy trước 2 ngày: hoàn 50%',
      'Hủy sát giờ: không hoàn tiền',
    ]);
  });

  it('uses a truthful fallback when no cancellation policy is configured', () => {
    expect(policyLines(null)).toEqual([
      'Chính sách hủy sẽ được xác nhận trong thông tin đặt chỗ.',
    ]);
  });
});
