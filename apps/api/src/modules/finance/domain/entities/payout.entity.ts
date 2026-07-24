import type { CreatePayoutInput } from '@booking/contracts';
import {
  NothingToPay,
  PayoutAllocationMismatch,
  PayoutBelowMinimum,
  PayoutInProgress,
  PayoutSettled,
  PayoutStateChanged,
} from '../errors/finance-domain-errors';
import type { CreatePayoutData, PayoutRecord } from '../ports/payout-repository.port';
import type { PayoutPolicy } from '../value-objects/payout-policy.value-object';

export interface PayoutCreationSnapshot {
  available: bigint;
  cutoff: Date;
  policy: PayoutPolicy;
  ineligibleReason: 'NOTHING_TO_PAY' | 'BELOW_MINIMUM' | null;
}

type PayoutState = Pick<PayoutRecord, 'status' | 'payeeType' | 'payeeId' | 'amount'>;

export class Payout {
  private constructor(private readonly state: PayoutState) {}

  static planCreation(
    snapshot: PayoutCreationSnapshot,
    input: CreatePayoutInput,
    createdBy: string | null,
  ): CreatePayoutData {
    if (snapshot.ineligibleReason === 'NOTHING_TO_PAY') throw new NothingToPay();
    if (snapshot.ineligibleReason === 'BELOW_MINIMUM') {
      throw new PayoutBelowMinimum(snapshot.available, snapshot.policy.minAmount);
    }
    const period = snapshot.policy.period({
      cycle: input.cycle,
      periodFrom: input.periodFrom,
      periodTo: input.periodTo,
      cutoff: snapshot.cutoff,
    });
    return {
      payeeType: input.payeeType,
      payeeId: input.payeeId,
      amount: snapshot.available,
      periodFrom: period.periodFrom,
      periodTo: period.periodTo,
      createdBy,
    };
  }

  static rehydrate(state: PayoutState): Payout {
    return new Payout(state);
  }

  static assertAllocated(payoutAmount: bigint, allocatedAmount: bigint): void {
    if (allocatedAmount !== payoutAmount) {
      throw new PayoutAllocationMismatch(payoutAmount, allocatedAmount);
    }
  }

  static assertClaimed(claimed: PayoutRecord | null): void {
    if (!claimed) throw new PayoutInProgress();
  }

  static assertStateUpdated(updated: PayoutRecord | null): asserts updated is PayoutRecord {
    if (!updated) throw new PayoutStateChanged();
  }

  classifyPayment(): 'already_paid' | 'claim' {
    if (this.state.status === 'paid') return 'already_paid';
    if (this.state.status === 'failed') throw new PayoutSettled(this.state.status);
    return 'claim';
  }

  classifyFailure(): void {
    if (this.state.status === 'paid' || this.state.status === 'failed') {
      throw new PayoutSettled(this.state.status);
    }
  }
}
