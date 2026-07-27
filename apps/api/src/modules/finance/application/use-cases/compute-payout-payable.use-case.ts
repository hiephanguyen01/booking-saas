import { Inject, Injectable } from '@nestjs/common';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import {
  LEDGER_REPOSITORY,
  type ILedgerRepository,
} from '../../domain/ports/ledger-repository.port';
import {
  PAYOUT_REPOSITORY,
  type IPayoutRepository,
  type PayoutPayeeType,
} from '../../domain/ports/payout-repository.port';
import type { PayoutPolicy } from '../../domain/value-objects/payout-policy.value-object';
import { GetPayoutPolicyUseCase } from './get-payout-policy.use-case';

/** Mirrors the exact error codes `CreatePayoutUseCase` rejects with. */
export type PayableIneligibleReason = 'NOTHING_TO_PAY' | 'BELOW_MINIMUM';

/** Everything that decides what a payout run for one payee would pay right now. */
export interface PayableSnapshot {
  payeeType: PayoutPayeeType;
  payeeId: string;
  /** Raw ledger balance (credit − debit). Context only — NOT what gets paid. */
  balance: bigint;
  /** Net payable already recognized by released settlement journals. */
  maturePayable: bigint;
  /** Already claimed by pending/processing runs. */
  outstanding: bigint;
  /** `maturePayable − outstanding` — the amount a run opened now would pay. */
  available: bigint;
  /** Latest ledger timestamp included in the payable calculation. */
  cutoff: Date;
  policy: PayoutPolicy;
  eligible: boolean;
  ineligibleReason: PayableIneligibleReason | null;
}

/**
 * The single source of truth for "what is actually payable to this payee" (§7.7).
 *
 * Both `CreatePayoutUseCase` (which pays it) and `GetTenantPayableUseCase` (which
 * previews it) call `execute()`, so the previewed number is by construction the
 * number a run would pay. This must stay the only place the rule lives: the
 * dashboard payout dialog used to show the raw ledger balance without subtracting
 * pending/processing payout claims. That can display the same payable twice and
 * makes the next run fail with NOTHING_TO_PAY / BELOW_MINIMUM. Held settlement
 * funds are intentionally absent from the ledger until release. Re-deriving the
 * payable anywhere else would recreate that divergence.
 */
@Injectable()
export class ComputePayoutPayableUseCase {
  constructor(
    @Inject(LEDGER_REPOSITORY) private readonly ledger: ILedgerRepository,
    @Inject(PAYOUT_REPOSITORY) private readonly payouts: IPayoutRepository,
    private readonly getPolicy: GetPayoutPolicyUseCase,
  ) {}

  async execute(
    tx: PrismaTx,
    tenantId: string,
    payeeType: PayoutPayeeType,
    payeeId: string,
  ): Promise<PayableSnapshot> {
    const policy = await this.getPolicy.execute(tx, tenantId);
    // Earnings only enter the payable ledger after the settlement dispute window
    // has elapsed. Applying holdingDays here again would delay payout twice.
    const owner = await this.ledger.ownerBalance(tx, payeeType, payeeId);
    const matured = await this.ledger.maturePayable(tx, payeeType, payeeId);
    const maturePayable = matured.amount;
    const outstanding = await this.payouts.outstandingForPayee(tx, payeeType, payeeId);
    const available = maturePayable - outstanding;

    // Same order as the run's own guards, so `ineligibleReason` always names the
    // code the run would actually reject with.
    const ineligibleReason: PayableIneligibleReason | null =
      available <= 0n ? 'NOTHING_TO_PAY' : available < policy.minAmount ? 'BELOW_MINIMUM' : null;

    return {
      payeeType,
      payeeId,
      balance: owner.credit - owner.debit,
      maturePayable,
      outstanding,
      available,
      cutoff: matured.cutoff,
      policy,
      eligible: ineligibleReason === null,
      ineligibleReason,
    };
  }
}
