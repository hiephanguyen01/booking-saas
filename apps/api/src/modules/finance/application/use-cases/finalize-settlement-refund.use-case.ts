import { Inject, Injectable } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  SETTLEMENT_REPOSITORY,
  type ISettlementRepository,
} from '../../domain/ports/settlement-repository.port';
import { GetPayoutPolicyUseCase } from './get-payout-policy.use-case';
import { Settlement } from '../../domain/entities/settlement.entity';
import { RecordWithholdingReversalUseCase } from './record-withholding-reversal.use-case';

/**
 * Apply provider/manual refund truth to custody; partial retention still waits
 * for disputes.
 *
 * A refund never edits or deletes the original tax assessment: it appends a
 * linked, proportional reversal, so the audit trail keeps
 * `assessment − Σ reversals = final tax position`. Because tax is assessed at
 * transaction acceptance, this holds whether the refund lands before or after
 * settlement release — and after a payout the clawback pushes the partner's
 * ledger balance negative, which the next payout run recovers.
 */
@Injectable()
export class FinalizeSettlementRefundUseCase {
  constructor(
    @Inject(SETTLEMENT_REPOSITORY) private readonly settlements: ISettlementRepository,
    private readonly policy: GetPayoutPolicyUseCase,
    private readonly reverseWithholding: RecordWithholdingReversalUseCase,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(
    tenantId: string,
    bookingId: string,
    refundId: string,
    amount: bigint,
    reason?: string | null,
  ): Promise<void> {
    await this.tenantDb.forTenant(tenantId, async (tx) => {
      const settlement = await this.settlements.ensureHeldForBooking(tx, tenantId, bookingId);
      if (!settlement) return;
      const finalized = Settlement.rehydrate(settlement).finalizeRefund(refundId, amount, reason);
      if (!finalized) return;
      const payoutPolicy = await this.policy.execute(tx, tenantId);
      const updated = await this.settlements.finalizeRefund(
        tx,
        bookingId,
        finalized.refundId,
        finalized.refundedAmount,
        payoutPolicy.holdingDays,
      );
      if (updated) {
        await this.reverseWithholding.execute(
          tx,
          tenantId,
          updated,
          finalized.refundId,
          finalized.refundedAmount,
        );
      }
    });
  }
}
