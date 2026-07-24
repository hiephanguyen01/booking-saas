import { Inject, Injectable } from '@nestjs/common';
import type { SettlementKind } from '@prisma/client';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  SETTLEMENT_REPOSITORY,
  type ISettlementRepository,
} from '../../domain/ports/settlement-repository.port';
import { GetPayoutPolicyUseCase } from './get-payout-policy.use-case';
import { Settlement } from '../../domain/entities/settlement.entity';

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
      const settlement = await this.settlements.ensureHeldForBooking(tx, tenantId, bookingId);
      if (!settlement) return;
      const plan = Settlement.rehydrate(settlement).planRefund(refundAmount, kind, incremental);
      if (plan.action === 'none') return;
      if (plan.action === 'prepare') {
        await this.settlements.prepareRefund(tx, bookingId, plan.refundedAmount, plan.kind);
        return;
      }

      const payoutPolicy = await this.policy.execute(tx, tenantId);
      await this.settlements.startDisputeWindow(
        tx,
        bookingId,
        plan.onsiteCollectedAmount,
        payoutPolicy.holdingDays,
        plan.amounts,
        plan.kind,
      );
    });
  }
}
