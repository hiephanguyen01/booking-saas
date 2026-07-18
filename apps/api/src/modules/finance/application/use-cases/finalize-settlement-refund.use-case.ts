import { Inject, Injectable } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  SETTLEMENT_REPOSITORY,
  type ISettlementRepository,
} from '../../domain/ports/settlement-repository.port';
import { GetPayoutPolicyUseCase } from './get-payout-policy.use-case';

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
      const settlement = await this.settlements.findByBooking(tx, bookingId);
      if (!settlement || settlement.refundId === refundId) return;
      const serviceRefundAmount =
        reason === 'booking_cancellation'
          ? max0(amount - settlement.securityDepositHeld)
          : amount;
      const cumulativeRefundedAmount =
        reason === 'dispute_refund'
          ? settlement.status === 'refund_pending'
            ? settlement.refundedAmount
            : settlement.refundedAmount + serviceRefundAmount
          : serviceRefundAmount;
      const payoutPolicy = await this.policy.execute(tx, tenantId);
      await this.settlements.finalizeRefund(
        tx,
        bookingId,
        refundId,
        cumulativeRefundedAmount,
        payoutPolicy.holdingDays,
      );
    });
  }
}

function max0(value: bigint): bigint {
  return value > 0n ? value : 0n;
}
