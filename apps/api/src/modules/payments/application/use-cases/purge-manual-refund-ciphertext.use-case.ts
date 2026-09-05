import { Inject, Injectable } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  MANUAL_REFUND_OPERATION_REPOSITORY,
  type IManualRefundOperationRepository,
} from '../../domain/ports/manual-refund-operation-repository.port';

@Injectable()
export class PurgeManualRefundCiphertextUseCase {
  constructor(
    @Inject(MANUAL_REFUND_OPERATION_REPOSITORY)
    private readonly operations: IManualRefundOperationRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  execute(tenantId: string, operationId: string): Promise<boolean> {
    return this.tenantDb.forTenant(tenantId, async (tx) => {
      const current = await this.operations.findById(tx, tenantId, operationId);
      if (
        !current ||
        current.status !== 'completed' ||
        !current.completedAt ||
        current.ciphertextPurgedAt ||
        !current.destinationAccountCiphertext
      ) {
        return false;
      }

      const now = await this.tenantDb.databaseNow(tx);
      const eligibleBefore = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      if (current.completedAt > eligibleBefore) return false;

      return this.operations.purgeCiphertext(
        tx,
        tenantId,
        operationId,
        current.version,
        eligibleBefore,
        now,
      );
    });
  }
}
