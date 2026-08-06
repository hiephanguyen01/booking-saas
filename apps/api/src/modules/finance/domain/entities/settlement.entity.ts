import { computeCommissionSplit } from '../../../../shared/domain/commission/commission-split';
import { snapshotToRates, type CommissionSnapshot } from '../../../../shared/domain/commission/commission-snapshot';
import {
  SettlementJournalExists,
  SettlementOnsiteAmountMismatch,
} from '../errors/finance-domain-errors';
import type { JournalLeg } from '../ledger-journal';
import type { ReleaseAmounts, SettlementRecord } from '../ports/settlement-repository.port';
import { LedgerJournal } from './ledger-journal.entity';

export interface SettlementBooking {
  id: string;
  partnerId: string;
  affiliateId: string | null;
  totalAmount: bigint;
  finalAmount: bigint;
  additionalCharges: bigint;
  snapshot: CommissionSnapshot;
  fundedBy: 'tenant' | 'partner' | null;
}

type SettlementState = Pick<
  SettlementRecord,
  | 'id'
  | 'tenantId'
  | 'bookingId'
  | 'paymentId'
  | 'status'
  | 'kind'
  | 'onlineHeldAmount'
  | 'onsiteCollectedAmount'
  | 'securityDepositHeld'
  | 'refundedAmount'
  | 'retainedAmount'
  | 'refundId'
  | 'disputeUntil'
>;

export type RefundPlan =
  | { action: 'none' }
  | { action: 'prepare'; refundedAmount: bigint; kind?: SettlementRecord['kind'] }
  | {
      action: 'window';
      onsiteCollectedAmount: 0n;
      amounts: ReleaseAmounts;
      kind: 'cancellation_fee';
    };

export interface FinalizedRefund {
  refundId: string;
  refundedAmount: bigint;
}

export interface SettlementWindowPlan {
  onsiteCollectedAmount: bigint;
  amounts: ReleaseAmounts;
  kind?: SettlementRecord['kind'];
}

export interface SettlementReleasePlan {
  amounts: ReleaseAmounts;
  legs: JournalLeg[];
  memo: 'settlement.cancellation_fee.released' | 'settlement.released';
}

export class Settlement {
  private constructor(private readonly state: SettlementState) {}

  static rehydrate(state: SettlementState): Settlement {
    return new Settlement(state);
  }

  startCompletionWindow(
    booking: SettlementBooking,
    reportedOnsiteCollected?: bigint,
  ): SettlementWindowPlan | null {
    if (this.state.status !== 'held') return null;

    const effectiveFinal = booking.finalAmount + booking.additionalCharges;
    const expectedOnsite = max0(effectiveFinal - this.state.onlineHeldAmount);
    const onsiteCollectedAmount = reportedOnsiteCollected ?? expectedOnsite;
    if (onsiteCollectedAmount !== expectedOnsite) {
      throw new SettlementOnsiteAmountMismatch(onsiteCollectedAmount, expectedOnsite);
    }

    const effectiveTotal = booking.totalAmount + booking.additionalCharges;
    const split = computeCommissionSplit({
      totalAmount: effectiveTotal,
      finalAmount: effectiveFinal,
      fundedBy: booking.fundedBy,
      hasAffiliate: booking.affiliateId !== null,
      rates: snapshotToRates(booking.snapshot),
    });
    const partnerBasis = booking.fundedBy === 'tenant' ? effectiveTotal : effectiveFinal;

    return {
      onsiteCollectedAmount,
      amounts: {
        tenantCommissionGross: booking.snapshot.isHouse
          ? effectiveFinal
          : partnerBasis - split.partnerShare,
        tenantNetEarning: split.tenantNet,
        partnerGrossEarning: split.partnerShare,
        partnerPayable: max0(split.partnerShare - onsiteCollectedAmount),
        platformFee: split.platformFee,
        affiliateCommission: split.affiliateCommission,
      },
    };
  }

  startNoShowWindow(booking: SettlementBooking): SettlementWindowPlan | null {
    if (this.state.status !== 'held') return null;

    const commissionBase = this.state.onlineHeldAmount;
    const split = computeCommissionSplit({
      totalAmount: commissionBase,
      finalAmount: commissionBase,
      fundedBy: null,
      hasAffiliate: booking.affiliateId !== null,
      rates: snapshotToRates(booking.snapshot),
    });

    return {
      onsiteCollectedAmount: 0n,
      amounts: {
        tenantCommissionGross: booking.snapshot.isHouse
          ? commissionBase
          : commissionBase - split.partnerShare,
        tenantNetEarning: split.tenantNet,
        partnerGrossEarning: split.partnerShare,
        partnerPayable: split.partnerShare,
        platformFee: split.platformFee,
        affiliateCommission: split.affiliateCommission,
      },
      kind: 'customer_no_show',
    };
  }

  planRefund(
    refundAmount: bigint,
    kind?: SettlementRecord['kind'],
    incremental = false,
  ): RefundPlan {
    if (this.isRefundTerminal()) return { action: 'none' };

    const serviceRefundAmount =
      kind === 'cancellation_fee'
        ? max0(refundAmount - this.state.securityDepositHeld)
        : refundAmount;
    if (serviceRefundAmount > 0n) {
      if (incremental && this.state.status === 'refund_pending') return { action: 'none' };
      return {
        action: 'prepare',
        refundedAmount: incremental
          ? this.state.refundedAmount + serviceRefundAmount
          : serviceRefundAmount,
        kind,
      };
    }

    const retained = this.state.onlineHeldAmount;
    return {
      action: 'window',
      onsiteCollectedAmount: 0n,
      amounts: {
        tenantCommissionGross: retained,
        tenantNetEarning: retained,
        partnerGrossEarning: 0n,
        partnerPayable: 0n,
        platformFee: 0n,
        affiliateCommission: 0n,
      },
      kind: 'cancellation_fee',
    };
  }

  finalizeRefund(refundId: string, amount: bigint, reason?: string | null): FinalizedRefund | null {
    if (this.state.refundId === refundId) return null;

    const serviceRefundAmount =
      reason === 'booking_cancellation' ? max0(amount - this.state.securityDepositHeld) : amount;
    const refundedAmount =
      reason === 'dispute_refund'
        ? this.state.status === 'refund_pending'
          ? this.state.refundedAmount
          : this.state.refundedAmount + serviceRefundAmount
        : serviceRefundAmount;

    return { refundId, refundedAmount };
  }

  releasePlan(
    booking: SettlementBooking,
    entries: ReadonlyArray<{ journalId: string; entryType: JournalLeg['entryType'] }>,
  ): SettlementReleasePlan | null {
    if (this.state.status !== 'dispute_window') return null;
    if (LedgerJournal.hasRevenue(entries)) throw new SettlementJournalExists();

    if (this.state.kind === 'cancellation_fee') {
      const retained = this.state.retainedAmount || this.state.onlineHeldAmount;
      return {
        amounts: {
          tenantCommissionGross: retained,
          tenantNetEarning: retained,
          partnerGrossEarning: 0n,
          partnerPayable: 0n,
          platformFee: 0n,
          affiliateCommission: 0n,
        },
        legs: LedgerJournal.cancellationFee({ tenantId: this.state.tenantId, retained }),
        memo: 'settlement.cancellation_fee.released',
      };
    }

    const noShow = this.state.kind === 'customer_no_show';
    const effectiveFinal = noShow
      ? max0(this.state.onlineHeldAmount - this.state.refundedAmount)
      : max0(booking.finalAmount + booking.additionalCharges - this.state.refundedAmount);
    const effectiveTotal = noShow
      ? effectiveFinal
      : max0(booking.totalAmount + booking.additionalCharges - this.state.refundedAmount);
    const split = computeCommissionSplit({
      totalAmount: effectiveTotal,
      finalAmount: effectiveFinal,
      fundedBy: noShow ? null : booking.fundedBy,
      hasAffiliate: booking.affiliateId !== null,
      rates: snapshotToRates(booking.snapshot),
    });
    const partnerBasis = !noShow && booking.fundedBy === 'tenant' ? effectiveTotal : effectiveFinal;
    const amounts: ReleaseAmounts = {
      tenantCommissionGross: booking.snapshot.isHouse
        ? effectiveFinal
        : partnerBasis - split.partnerShare,
      tenantNetEarning: split.tenantNet,
      partnerGrossEarning: split.partnerShare,
      partnerPayable: max0(split.partnerShare - this.state.onsiteCollectedAmount),
      platformFee: split.platformFee,
      affiliateCommission: split.affiliateCommission,
    };

    return {
      amounts,
      legs: LedgerJournal.revenue({
        tenantId: this.state.tenantId,
        partnerId: booking.partnerId,
        affiliateId: booking.affiliateId,
        isHouse: booking.snapshot.isHouse,
        commissionBase: effectiveFinal,
        cashViaGateway: max0(this.state.onlineHeldAmount - this.state.refundedAmount),
        additionalCharges: noShow ? 0n : booking.additionalCharges,
        split,
        cashEntryType: 'booking_revenue',
      }),
      memo: 'settlement.released',
    };
  }

  canRecordClawback(): boolean {
    return this.state.status !== 'released';
  }

  isAwaitingRelease(): boolean {
    return this.state.status === 'dispute_window';
  }

  canOpenDispute(now: Date, hasExistingDispute: boolean): boolean {
    return Settlement.allowsDispute(this.state, now, hasExistingDispute);
  }

  /**
   * The same rule without a whole record to rehydrate, so the list projection
   * and the per-booking read cannot drift into two definitions of "disputable".
   */
  static allowsDispute(
    state: Pick<SettlementRecord, 'status' | 'disputeUntil'>,
    now: Date,
    hasExistingDispute: boolean,
  ): boolean {
    return (
      !hasExistingDispute &&
      state.status === 'dispute_window' &&
      state.disputeUntil !== null &&
      state.disputeUntil > now
    );
  }

  private isRefundTerminal(): boolean {
    return this.state.status === 'released' || this.state.status === 'refunded';
  }
}

function max0(value: bigint): bigint {
  return value > 0n ? value : 0n;
}
