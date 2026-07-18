import { ConflictException, Inject, Injectable } from '@nestjs/common';
import type { RespondSettlementDisputeInput } from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  SETTLEMENT_DISPUTE_REPOSITORY,
  type ISettlementDisputeRepository,
  type SettlementDisputeRecord,
} from '../../domain/ports/settlement-dispute-repository.port';

/** Partner adds a single factual response while the claim is still open. */
@Injectable()
export class RespondSettlementDisputeUseCase {
  constructor(
    @Inject(SETTLEMENT_DISPUTE_REPOSITORY)
    private readonly disputes: ISettlementDisputeRepository,
    private readonly tenantDb: TenantDbService,
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
      if (!dispute) {
        throw new ConflictException({
          statusCode: 409,
          code: 'DISPUTE_RESPONSE_NOT_ACCEPTED',
          message: 'The dispute is closed, already answered, or does not belong to this partner',
        });
      }
      return dispute;
    });
  }
}
