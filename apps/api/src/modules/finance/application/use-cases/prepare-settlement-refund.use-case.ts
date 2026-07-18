import { Inject, Injectable } from '@nestjs/common';
import type { SettlementKind } from '@prisma/client';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  SETTLEMENT_REPOSITORY,
  type ISettlementRepository,
  type ReleaseAmounts,
} from '../../domain/ports/settlement-repository.port';
import { GetPayoutPolicyUseCase } from './get-payout-policy.use-case';

/** Freeze a cancelled/disputed settlement while its provider/manual refund is unresolved. */
@Injectable()
export class PrepareSettlementRefundUseCase {
  constructor(
    @Inject(SETTLEMENT_REPOSITORY) private readonly settlements: ISettlementRepository,
    private readonly policy: GetPayoutPolicyUseCase,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(
    tenantId: string,
    bookingId: string,
    refundAmount: bigint,
    kind?: SettlementKind,
    incremental = false,
  ): Promise<void> {
    await this.tenantDb.forTenant(tenantId, async (tx) => {
      const settlement = await this.settlements.findByBooking(tx, bookingId);
      if (!settlement || ['released', 'refunded'].includes(settlement.status)) return;
      // Cancellation refunds include the separately-held security deposit in the
      // gateway transfer. Custody settlement only tracks the service-money part.
      const serviceRefundAmount =
        kind === 'cancellation_fee'
          ? max0(refundAmount - settlement.securityDepositHeld)
          : refundAmount;
      if (serviceRefundAmount > 0n) {
        // A dispute refund is a delta on top of any cancellation refund already
        // completed. `refund_pending` means the initiating transaction already
        // stored the cumulative target, so a later manual-refund event is a no-op.
        if (incremental && settlement.status === 'refund_pending') return;
        const targetRefundedAmount = incremental
          ? settlement.refundedAmount + serviceRefundAmount
          : serviceRefundAmount;
        await this.settlements.prepareRefund(tx, bookingId, targetRefundedAmount, kind);
        return;
      }

      const payoutPolicy = await this.policy.execute(tx, tenantId);
      const retained = settlement.onlineHeldAmount;
      const amounts: ReleaseAmounts = {
        tenantCommissionGross: retained,
        tenantNetEarning: retained,
        partnerGrossEarning: 0n,
        partnerPayable: 0n,
        platformFee: 0n,
        affiliateCommission: 0n,
      };
      await this.settlements.startDisputeWindow(
        tx,
        bookingId,
        0n,
        payoutPolicy.holdingDays,
        amounts,
        'cancellation_fee',
      );
    });
  }
}

function max0(value: bigint): bigint {
  return value > 0n ? value : 0n;
}
