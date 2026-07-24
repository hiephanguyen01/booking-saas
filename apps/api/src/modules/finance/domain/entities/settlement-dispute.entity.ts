import type { ResolveSettlementDisputeInput } from '@booking/contracts';
import {
  DisputeAlreadyResolved,
  DisputeNotResolvable,
  DisputeResponseNotAccepted,
  DisputeWindowClosed,
  InvalidDisputeRefundAmount,
  PartialRefundMustBePartial,
} from '../errors/finance-domain-errors';
import type { SettlementDisputeRecord } from '../ports/settlement-dispute-repository.port';
import type { SettlementRecord } from '../ports/settlement-repository.port';

type DisputeState = Pick<SettlementDisputeRecord, 'id' | 'status' | 'settlementId' | 'bookingId'>;

export type DisputeResolutionPlan =
  | {
      action: 'release';
      data: {
        status: 'rejected';
        resolution: 'release';
        note: string;
        refundAmount: 0n;
        resolvedBy: string;
      };
    }
  | {
      action: 'refund';
      prepareRefundAmount: bigint;
      refundAmount: bigint;
      affectsBookingStatus: boolean;
      data: {
        status: 'accepted';
        resolution: 'full_refund' | 'partial_refund';
        note: string;
        refundAmount: bigint;
        resolvedBy: string;
      };
    };

export class SettlementDispute {
  private constructor(private readonly state: DisputeState) {}

  static classifyExisting(
    existing: SettlementDisputeRecord | null,
  ): SettlementDisputeRecord | null {
    if (!existing) return null;
    if (existing.status === 'open') return existing;
    throw new DisputeAlreadyResolved();
  }

  static rehydrate(state: DisputeState): SettlementDispute {
    return new SettlementDispute(state);
  }

  static assertWindowOpened(opened: boolean): void {
    if (!opened) throw new DisputeWindowClosed();
  }

  static assertResponseAccepted(
    dispute: SettlementDisputeRecord | null,
  ): asserts dispute is SettlementDisputeRecord {
    if (!dispute) throw new DisputeResponseNotAccepted();
  }

  static assertReleaseAccepted(accepted: boolean): void {
    if (!accepted) throw new DisputeNotResolvable();
  }

  isAlreadyResolved(): boolean {
    return this.state.status !== 'open';
  }

  planResolution(
    input: ResolveSettlementDisputeInput,
    settlement: Pick<SettlementRecord, 'onlineHeldAmount' | 'refundedAmount'>,
    actorId: string,
  ): DisputeResolutionPlan {
    if (input.resolution === 'release') {
      return {
        action: 'release',
        data: {
          status: 'rejected',
          resolution: 'release',
          note: input.note,
          refundAmount: 0n,
          resolvedBy: actorId,
        },
      };
    }

    const remainingHeld = max0(settlement.onlineHeldAmount - settlement.refundedAmount);
    const refundAmount =
      input.resolution === 'full_refund' ? remainingHeld : BigInt(input.refundAmount ?? '0');
    if (refundAmount <= 0n || refundAmount > remainingHeld) {
      throw new InvalidDisputeRefundAmount();
    }
    if (input.resolution === 'partial_refund' && refundAmount === remainingHeld) {
      throw new PartialRefundMustBePartial();
    }

    return {
      action: 'refund',
      prepareRefundAmount: settlement.refundedAmount + refundAmount,
      refundAmount,
      affectsBookingStatus: input.resolution === 'full_refund',
      data: {
        status: 'accepted',
        resolution: input.resolution,
        note: input.note,
        refundAmount,
        resolvedBy: actorId,
      },
    };
  }
}

function max0(value: bigint): bigint {
  return value > 0n ? value : 0n;
}
