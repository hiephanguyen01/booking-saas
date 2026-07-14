import { describe, expect, it } from 'vitest';
import { computeCommissionSplit } from '../../finance/domain/commission-split';
import { buildRevenueJournal, isBalanced, sumCredit, sumDebit } from '../../finance/domain/ledger-journal';
import type { CommissionSnapshot } from '../../finance/domain/commission-snapshot';
import { computeAffiliateCommission } from './affiliate-commission-amount';

/** The §3.3 / §13.2 worked example rates (tenant 15%, platform 2%, affiliate 5%). */
const snapshot: CommissionSnapshot = {
  ruleId: 'rule-1',
  appliesTo: 'tenant_default',
  tenantRateType: 'percent',
  tenantRate: '15',
  platformRate: 2,
  affiliateRateType: 'percent',
  affiliateRate: '5',
  isHouse: false,
};

describe('computeAffiliateCommission (§13.2)', () => {
  it('is 5% of the 2,000,000 booking = 100,000', () => {
    const amount = computeAffiliateCommission({
      snapshot,
      totalAmount: 2_000_000n,
      finalAmount: 2_000_000n,
      additionalCharges: 0n,
      fundedBy: null,
    });
    expect(amount).toBe(100_000n);
  });

  it('includes additional charges in the base (§8.3)', () => {
    const amount = computeAffiliateCommission({
      snapshot,
      totalAmount: 2_000_000n,
      finalAmount: 2_000_000n,
      additionalCharges: 200_000n,
      fundedBy: null,
    });
    // 5% of (2,000,000 + 200,000) = 110,000.
    expect(amount).toBe(110_000n);
  });

  it('uses a custom rate baked into the snapshot (§15.2)', () => {
    const custom: CommissionSnapshot = { ...snapshot, affiliateRate: '8' };
    const amount = computeAffiliateCommission({
      snapshot: custom,
      totalAmount: 2_000_000n,
      finalAmount: 2_000_000n,
      additionalCharges: 0n,
      fundedBy: null,
    });
    expect(amount).toBe(160_000n);
  });
});

describe('affiliate leg keeps the ledger balanced (Definition of Done)', () => {
  it('the §13.2 journal balances with the affiliate leg included', () => {
    const split = computeCommissionSplit({
      totalAmount: 2_000_000n,
      finalAmount: 2_000_000n,
      fundedBy: null,
      hasAffiliate: true,
      rates: {
        tenantRateType: 'percent',
        tenantRate: 15n,
        platformRate: 2,
        affiliateRateType: 'percent',
        affiliateRate: 5n,
        isHouse: false,
      },
    });
    const legs = buildRevenueJournal({
      tenantId: 'tenant-1',
      partnerId: 'partner-1',
      affiliateId: 'affiliate-1',
      isHouse: false,
      commissionBase: 2_000_000n,
      cashViaGateway: 2_000_000n,
      additionalCharges: 0n,
      split,
      cashEntryType: 'booking_revenue',
    });

    // §13.2 expected legs: partner 1,700,000 / affiliate 100,000 / platform 40,000 / tenant 160,000.
    expect(split.affiliateCommission).toBe(100_000n);
    expect(split.partnerShare).toBe(1_700_000n);
    expect(split.platformFee).toBe(40_000n);
    expect(isBalanced(legs)).toBe(true);
    expect(sumDebit(legs)).toBe(2_000_000n);
    expect(sumCredit(legs)).toBe(2_000_000n);

    const affiliateLeg = legs.find((l) => l.entryType === 'affiliate_commission');
    expect(affiliateLeg?.credit).toBe(100_000n);
  });
});
