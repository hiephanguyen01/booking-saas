import { Inject, Injectable } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  SETTLEMENT_REPOSITORY,
  type ISettlementRepository,
} from '../../domain/ports/settlement-repository.port';
import { GetPayoutPolicyUseCase } from './get-payout-policy.use-case';
import { Settlement } from '../../domain/entities/settlement.entity';

/** Apply provider/manual refund truth to custody; partial retention still waits for disputes. */
@Injectable()
export class FinalizeSettlementRefundUseCase {
  constructor(
    @Inject(SETTLEMENT_REPOSITORY) private readonly settlements: ISettlementRepository,
    private readonly policy: GetPayoutPolicyUseCase,
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
      await this.settlements.finalizeRefund(
        tx,
        bookingId,
        finalized.refundId,
        finalized.refundedAmount,
        payoutPolicy.holdingDays,
      );
    });
  }
}
