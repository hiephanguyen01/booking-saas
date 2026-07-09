import { describe, expect, it } from 'vitest';
import { computeCommissionSplit, type CommissionRates } from './commission-split';

const standardRates: CommissionRates = {
  tenantRateType: 'percent',
  tenantRate: 15n,
  platformRate: 2,
  affiliateRateType: 'percent',
  affiliateRate: 5n,
  isHouse: false,
};

describe('computeCommissionSplit', () => {
  it('§3.3 worked example — 2,000,000 booking with an affiliate', () => {
    const split = computeCommissionSplit({
      totalAmount: 2_000_000n,
      finalAmount: 2_000_000n,
      fundedBy: null,
      hasAffiliate: true,
      rates: standardRates,
    });
    expect(split.partnerShare).toBe(1_700_000n);
    expect(split.platformFee).toBe(40_000n);
    expect(split.affiliateCommission).toBe(100_000n);
    expect(split.tenantNet).toBe(160_000n);
    expect(split.flags).toEqual([]);
  });

  it('no affiliate on the booking → no affiliate leg', () => {
    const split = computeCommissionSplit({
      totalAmount: 2_000_000n,
      finalAmount: 2_000_000n,
      fundedBy: null,
      hasAffiliate: false,
      rates: standardRates,
    });
    expect(split.affiliateCommission).toBe(0n);
    expect(split.tenantNet).toBe(260_000n); // 300k − 40k platform
  });

  it('§12.4 funded_by = tenant — partner paid on the original price', () => {
    const split = computeCommissionSplit({
      totalAmount: 2_000_000n,
      finalAmount: 1_900_000n,
      fundedBy: 'tenant',
      hasAffiliate: true,
      rates: standardRates,
    });
    expect(split.partnerShare).toBe(1_700_000n); // 2,000,000 − 15%
    expect(split.platformFee).toBe(38_000n); // 2% × 1,900,000
    expect(split.affiliateCommission).toBe(95_000n); // 5% × 1,900,000
    expect(split.promoDiscount).toBe(100_000n);
    expect(split.tenantNet).toBe(67_000n); // 300k − 38k − 95k − 100k
  });

  it('§12.4 funded_by = partner — partner paid on the discounted price', () => {
    const split = computeCommissionSplit({
      totalAmount: 2_000_000n,
      finalAmount: 1_900_000n,
      fundedBy: 'partner',
      hasAffiliate: true,
      rates: standardRates,
    });
    expect(split.partnerShare).toBe(1_615_000n); // 1,900,000 − 15%
    expect(split.platformFee).toBe(38_000n);
    expect(split.affiliateCommission).toBe(95_000n);
    expect(split.promoDiscount).toBe(0n);
    expect(split.tenantNet).toBe(152_000n); // 285k − 38k − 95k
  });

  it('house partner — no partner leg, platform fee on GMV', () => {
    const split = computeCommissionSplit({
      totalAmount: 1_000_000n,
      finalAmount: 1_000_000n,
      fundedBy: null,
      hasAffiliate: false,
      rates: { ...standardRates, isHouse: true },
    });
    expect(split.partnerShare).toBe(0n);
    expect(split.platformFee).toBe(20_000n);
    expect(split.tenantNet).toBe(980_000n);
  });

  it('a fixed tenant fee larger than the booking floors the partner share + flags', () => {
    const split = computeCommissionSplit({
      totalAmount: 150_000n,
      finalAmount: 150_000n,
      fundedBy: null,
      hasAffiliate: false,
      rates: { ...standardRates, tenantRateType: 'fixed', tenantRate: 200_000n, platformRate: 0, affiliateRate: 0n },
    });
    expect(split.partnerShare).toBe(0n);
    expect(split.tenantNet).toBe(150_000n); // commission capped at the booking value
    expect(split.flags).toContain('PARTNER_SHARE_FLOORED');
  });

  it('flags a negative tenant net (fixed + promo + affiliate combo)', () => {
    const split = computeCommissionSplit({
      totalAmount: 1_000_000n,
      finalAmount: 900_000n,
      fundedBy: 'tenant',
      hasAffiliate: true,
      rates: { tenantRateType: 'percent', tenantRate: 10n, platformRate: 2, affiliateRateType: 'percent', affiliateRate: 5n, isHouse: false },
    });
    // tenantCommission = 100k; platform 18k; affiliate 45k; promo 100k → net = −63k
    expect(split.tenantNet).toBe(-63_000n);
    expect(split.flags).toContain('TENANT_NET_NEGATIVE');
  });
});
