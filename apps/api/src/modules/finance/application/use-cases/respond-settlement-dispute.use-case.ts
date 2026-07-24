import { Inject, Injectable } from '@nestjs/common';
import type { RespondSettlementDisputeInput } from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import {
  SETTLEMENT_DISPUTE_REPOSITORY,
  type ISettlementDisputeRepository,
  type SettlementDisputeRecord,
} from '../../domain/ports/settlement-dispute-repository.port';
import { SettlementDispute } from '../../domain/entities/settlement-dispute.entity';

/** Partner adds a single factual response while the claim is still open. */
@Injectable()
export class RespondSettlementDisputeUseCase {
  constructor(
    @Inject(SETTLEMENT_DISPUTE_REPOSITORY)
    private readonly disputes: ISettlementDisputeRepository,
    private readonly tenantDb: TenantDbService,
    private readonly outbox: OutboxService,
  ) {}

  execute(
    tenantId: string,
    disputeId: string,
    partnerId: string,
    actorId: string,
    input: RespondSettlementDisputeInput,
  ): Promise<SettlementDisputeRecord> {
    return this.tenantDb.forTenant(tenantId, async (tx) => {
      const dispute = await this.disputes.respond(
        tx,
        disputeId,
        partnerId,
        input.response,
        actorId,
      );
      SettlementDispute.assertResponseAccepted(dispute);
      await this.outbox.emit(tx, {
        tenantId,
        eventType: 'settlement.dispute_responded',
        payload: { disputeId: dispute.id, bookingId: dispute.bookingId, partnerId },
      });
      return dispute;
    });
  }
}
