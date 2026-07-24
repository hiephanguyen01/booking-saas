import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { ResolveSettlementDisputeInput } from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import {
  SETTLEMENT_DISPUTE_REPOSITORY,
  type ISettlementDisputeRepository,
  type SettlementDisputeRecord,
} from '../../domain/ports/settlement-dispute-repository.port';
import {
  SETTLEMENT_REPOSITORY,
  type ISettlementRepository,
} from '../../domain/ports/settlement-repository.port';
import { SettlementDispute } from '../../domain/entities/settlement-dispute.entity';
import { DisputeNotFound } from '../../domain/errors/finance-domain-errors';

/** Tenant adjudicates an open dispute: release the hold or request a refund. */
@Injectable()
export class ResolveSettlementDisputeUseCase {
  constructor(
    @Inject(SETTLEMENT_REPOSITORY) private readonly settlements: ISettlementRepository,
    @Inject(SETTLEMENT_DISPUTE_REPOSITORY)
    private readonly disputes: ISettlementDisputeRepository,
    private readonly tenantDb: TenantDbService,
    private readonly outbox: OutboxService,
  ) {}

  execute(
    tenantId: string,
    disputeId: string,
    input: ResolveSettlementDisputeInput,
    actorId: string,
  ): Promise<SettlementDisputeRecord> {
    return this.tenantDb.forTenant(tenantId, async (tx) => {
      const dispute = await this.disputes.findById(tx, disputeId);
      if (!dispute) throw new DisputeNotFound();
      const aggregate = SettlementDispute.rehydrate(dispute);
      if (aggregate.isAlreadyResolved()) return dispute;
      const settlement = await this.settlements.findById(tx, dispute.settlementId);
      if (!settlement) throw new NotFoundException();
      const plan = aggregate.planResolution(input, settlement, actorId);

      if (plan.action === 'release') {
        SettlementDispute.assertReleaseAccepted(
          await this.settlements.resolveDisputeForRelease(tx, settlement.id),
        );
        const resolved = await this.disputes.resolve(tx, disputeId, plan.data);
        if (!resolved) throw new ConflictException();
        await this.outbox.emit(tx, {
          tenantId,
          eventType: 'settlement.release_requested',
          payload: { settlementId: settlement.id },
        });
        await this.outbox.emit(tx, {
          tenantId,
          eventType: 'settlement.dispute_resolved',
          payload: { disputeId: resolved.id, bookingId: dispute.bookingId, resolution: 'release' },
        });
        return resolved;
      }

      await this.settlements.prepareRefund(tx, dispute.bookingId, plan.prepareRefundAmount);
      const resolved = await this.disputes.resolve(tx, disputeId, plan.data);
      if (!resolved) throw new ConflictException();
      await this.outbox.emit(tx, {
        tenantId,
        eventType: 'settlement.refund_requested',
        payload: {
          bookingId: dispute.bookingId,
          amount: plan.refundAmount.toString(),
          affectsBookingStatus: plan.affectsBookingStatus,
        },
      });
      await this.outbox.emit(tx, {
        tenantId,
        eventType: 'settlement.dispute_resolved',
        payload: {
          disputeId: resolved.id,
          bookingId: dispute.bookingId,
          resolution: plan.data.resolution,
        },
      });
      return resolved;
    });
  }
}
