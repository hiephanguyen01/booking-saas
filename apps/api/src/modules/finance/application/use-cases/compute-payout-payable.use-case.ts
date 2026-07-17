import { Inject, Injectable } from '@nestjs/common';
import type { PayoutCycleDto } from '@booking/contracts';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import { addDays, utcNow } from '../../../../shared/time/time';
import { LEDGER_REPOSITORY, type ILedgerRepository } from '../../domain/ports/ledger-repository.port';
import {
  PAYOUT_REPOSITORY,
  type IPayoutRepository,
  type PayoutPayeeType,
} from '../../domain/ports/payout-repository.port';

/** Tenant payout policy (§7.7), read from `tenants.settings.payout`. */
export interface PayoutPolicy {
  /** Dispute buffer: payable is only mature once it is this many days old. */
  holdingDays: number;
  /** Minimum VND a run must reach to be accepted. */
  minAmount: bigint;
  /** Cadence a payout run covers — drives the derived period window. */
  cycle: PayoutCycleDto;
}

/** Mirrors the exact error codes `CreatePayoutUseCase` rejects with. */
export type PayableIneligibleReason = 'NOTHING_TO_PAY' | 'BELOW_MINIMUM';

/** Everything that decides what a payout run for one payee would pay right now. */
export interface PayableSnapshot {
  payeeType: PayoutPayeeType;
  payeeId: string;
  /** Raw ledger balance (credit − debit). Context only — NOT what gets paid. */
  balance: bigint;
  /** Net payable that has cleared the holding window. */
  maturePayable: bigint;
  /** Already claimed by pending/processing runs. */
  outstanding: bigint;
  /** `maturePayable − outstanding` — the amount a run opened now would pay. */
  available: bigint;
  /** The holding-window boundary the mature payable was measured against. */
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
 * dashboard payout dialog used to show the raw ledger balance, which is a
 * *different, larger* number — money still inside the holding window or already
 * claimed by an unsettled run is in the balance but is not payable — so a payee
 * that looked flush would fail the run with a hard NOTHING_TO_PAY / BELOW_MINIMUM.
 * Re-deriving the payable anywhere else would just recreate that divergence.
 */
@Injectable()
export class ComputePayoutPayableUseCase {
  constructor(
    @Inject(LEDGER_REPOSITORY) private readonly ledger: ILedgerRepository,
    @Inject(PAYOUT_REPOSITORY) private readonly payouts: IPayoutRepository,
  ) {}

  async execute(
    tx: PrismaTx,
    tenantId: string,
    payeeType: PayoutPayeeType,
    payeeId: string,
  ): Promise<PayableSnapshot> {
    const policy = await this.policy(tx, tenantId);
    const cutoff = addDays(utcNow(), -policy.holdingDays);

    const owner = await this.ledger.ownerBalance(tx, payeeType, payeeId);
    const maturePayable = await this.ledger.maturePayable(tx, payeeType, payeeId, cutoff);
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
      cutoff,
      policy,
      eligible: ineligibleReason === null,
      ineligibleReason,
    };
  }

  /**
   * Keyed on `tenantId` on purpose: `tenants` carries no RLS policy (it is the
   * tenant registry itself, not tenant-scoped data), so an unkeyed `findFirst`
   * here would read an arbitrary tenant's payout policy.
   */
  private async policy(tx: PrismaTx, tenantId: string): Promise<PayoutPolicy> {
    const tenant = await tx.tenant.findUnique({ where: { id: tenantId }, select: { settings: true } });
    const payout = (
      tenant?.settings as { payout?: { holdingDays?: number; minAmount?: string | number; cycle?: string } } | null
    )?.payout;
    const holdingDays = typeof payout?.holdingDays === 'number' ? payout.holdingDays : 3;
    const minAmount =
      payout?.minAmount !== undefined && /^\d+$/.test(String(payout.minAmount)) ? BigInt(payout.minAmount) : 0n;
    const cycle: PayoutCycleDto = payout?.cycle === 'weekly' ? 'weekly' : 'monthly';
    return { holdingDays, minAmount, cycle };
  }
}
