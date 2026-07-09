import { describe, expect, it } from 'vitest';
import { computeCommissionSplit, type CommissionRates } from './commission-split';
import {
  buildCancellationFeeJournal,
  buildClawbackJournal,
  buildPayoutJournal,
  buildRevenueJournal,
  isBalanced,
  sumCredit,
  sumDebit,
  type JournalLeg,
} from './ledger-journal';

const rates: CommissionRates = {
  tenantRateType: 'percent',
  tenantRate: 15n,
  platformRate: 2,
  affiliateRateType: 'percent',
  affiliateRate: 5n,
  isHouse: false,
};

const T = 'tenant-1';
const P = 'partner-1';

function netOf(legs: JournalLeg[], ownerType: string, ownerId: string | null): bigint {
  return legs
    .filter((l) => l.owner.ownerType === ownerType && l.owner.ownerId === ownerId)
    .reduce((acc, l) => acc + l.credit - l.debit, 0n);
}

describe('ledger journal builders — always balanced', () => {
  it('completed booking, full online payment, with affiliate (§13.2)', () => {
    const split = computeCommissionSplit({ totalAmount: 2_000_000n, finalAmount: 2_000_000n, fundedBy: null, hasAffiliate: true, rates });
    const legs = buildRevenueJournal({
      tenantId: T, partnerId: P, affiliateId: 'aff-1', isHouse: false,
      commissionBase: 2_000_000n, cashViaGateway: 2_000_000n, additionalCharges: 0n, split, cashEntryType: 'booking_revenue',
    });
    expect(isBalanced(legs)).toBe(true);
    expect(sumDebit(legs)).toBe(2_000_000n);
    // partner payable / platform / affiliate / tenant revenue reconcile.
    expect(netOf(legs, 'partner', P)).toBe(1_700_000n);
    expect(netOf(legs, 'platform', null)).toBe(40_000n);
    expect(netOf(legs, 'affiliate', 'aff-1')).toBe(100_000n);
    expect(netOf(legs, 'tenant', T)).toBe(160_000n); // revenue account
    expect(netOf(legs, 'tenant', null)).toBe(-2_000_000n); // cash held (float owed out)
  });

  it('completed booking, deposit paid online + balance collected on-site', () => {
    const split = computeCommissionSplit({ totalAmount: 1_000_000n, finalAmount: 1_000_000n, fundedBy: null, hasAffiliate: false, rates });
    const legs = buildRevenueJournal({
      tenantId: T, partnerId: P, affiliateId: null, isHouse: false,
      commissionBase: 1_000_000n, cashViaGateway: 500_000n, additionalCharges: 0n, split, cashEntryType: 'booking_revenue',
    });
    expect(isBalanced(legs)).toBe(true);
    // partner share 850k, but partner already holds 500k on-site → payable 350k.
    expect(netOf(legs, 'partner', P)).toBe(350_000n);
    expect(netOf(legs, 'tenant', T)).toBe(130_000n); // 1,000,000 − 850,000 − 20,000
  });

  it('funded_by = tenant completion balances via the promo_discount leg', () => {
    const split = computeCommissionSplit({ totalAmount: 2_000_000n, finalAmount: 1_900_000n, fundedBy: 'tenant', hasAffiliate: true, rates });
    const legs = buildRevenueJournal({
      tenantId: T, partnerId: P, affiliateId: 'aff-1', isHouse: false,
      commissionBase: 1_900_000n, cashViaGateway: 1_900_000n, additionalCharges: 0n, split, cashEntryType: 'booking_revenue',
    });
    expect(isBalanced(legs)).toBe(true);
    expect(sumDebit(legs)).toBe(2_000_000n); // 1,900,000 cash + 100,000 promo
    expect(netOf(legs, 'partner', P)).toBe(1_700_000n);
    expect(netOf(legs, 'tenant', T)).toBe(67_000n); // gross 167k − promo 100k
  });

  it('completion with additional charges collected on-site', () => {
    const split = computeCommissionSplit({ totalAmount: 1_100_000n, finalAmount: 1_100_000n, fundedBy: null, hasAffiliate: false, rates });
    const legs = buildRevenueJournal({
      tenantId: T, partnerId: P, affiliateId: null, isHouse: false,
      commissionBase: 1_100_000n, cashViaGateway: 1_000_000n, additionalCharges: 100_000n, split, cashEntryType: 'booking_revenue',
    });
    expect(isBalanced(legs)).toBe(true);
    expect(legs.some((l) => l.entryType === 'additional_charge' && l.debit === 100_000n)).toBe(true);
  });

  it('house partner completion — no partner leg', () => {
    const split = computeCommissionSplit({ totalAmount: 1_000_000n, finalAmount: 1_000_000n, fundedBy: null, hasAffiliate: false, rates: { ...rates, isHouse: true } });
    const legs = buildRevenueJournal({
      tenantId: T, partnerId: P, affiliateId: null, isHouse: true,
      commissionBase: 1_000_000n, cashViaGateway: 1_000_000n, additionalCharges: 0n, split, cashEntryType: 'booking_revenue',
    });
    expect(isBalanced(legs)).toBe(true);
    expect(legs.some((l) => l.owner.ownerType === 'partner')).toBe(false);
    expect(netOf(legs, 'platform', null)).toBe(20_000n);
    expect(netOf(legs, 'tenant', T)).toBe(980_000n);
  });

  it('no-show journal on the forfeited paid amount', () => {
    const split = computeCommissionSplit({ totalAmount: 500_000n, finalAmount: 500_000n, fundedBy: null, hasAffiliate: false, rates });
    const legs = buildRevenueJournal({
      tenantId: T, partnerId: P, affiliateId: null, isHouse: false,
      commissionBase: 500_000n, cashViaGateway: 500_000n, additionalCharges: 0n, split, cashEntryType: 'booking_revenue',
    });
    expect(isBalanced(legs)).toBe(true);
    expect(sumCredit(legs)).toBe(500_000n);
  });

  it('cancellation fee journal on the retained portion (and none on full refund)', () => {
    const retained = buildCancellationFeeJournal({ tenantId: T, retained: 200_000n });
    expect(isBalanced(retained)).toBe(true);
    expect(netOf(retained, 'tenant', T)).toBe(200_000n);
    expect(buildCancellationFeeJournal({ tenantId: T, retained: 0n })).toEqual([]);
  });

  it('clawback reverses a completed journal exactly', () => {
    const split = computeCommissionSplit({ totalAmount: 2_000_000n, finalAmount: 2_000_000n, fundedBy: null, hasAffiliate: true, rates });
    const original = buildRevenueJournal({
      tenantId: T, partnerId: P, affiliateId: 'aff-1', isHouse: false,
      commissionBase: 2_000_000n, cashViaGateway: 2_000_000n, additionalCharges: 0n, split, cashEntryType: 'booking_revenue',
    });
    const clawback = buildClawbackJournal(original);
    expect(isBalanced(clawback)).toBe(true);
    // Net of original + clawback on every account is zero.
    for (const [ot, oid] of [['partner', P], ['platform', null], ['affiliate', 'aff-1'], ['tenant', T], ['tenant', null]] as const) {
      expect(netOf(original, ot, oid) + netOf(clawback, ot, oid)).toBe(0n);
    }
  });

  it('payout journal debits the payee payable, credits tenant cash', () => {
    const legs = buildPayoutJournal({ tenantId: T, payeeType: 'partner', payeeId: P, amount: 350_000n });
    expect(isBalanced(legs)).toBe(true);
    expect(netOf(legs, 'partner', P)).toBe(-350_000n); // payable debited toward zero
    expect(netOf(legs, 'tenant', null)).toBe(350_000n); // cash credited out (offsets the debit float)
  });
});
