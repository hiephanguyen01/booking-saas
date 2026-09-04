import type { CreateManualRefundEvidenceUploadInput, ManualRefundEvidenceUploadResponse } from '@booking/contracts';
import { MAX_MANUAL_REFUND_EVIDENCE_SIZE_BYTES } from '@booking/contracts';
import { Inject, Injectable } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { STORAGE_PORT, type StoragePort } from '../../../storage/domain/ports/storage.port';
import { ManualRefundConcurrentUpdate, ManualRefundEvidenceUploadInvalid, ManualRefundOperationNotFound } from '../../domain/errors/manual-refund-errors';
import { MANUAL_REFUND_EVIDENCE_REPOSITORY, type IManualRefundEvidenceRepository } from '../../domain/ports/manual-refund-evidence-repository.port';
import { MANUAL_REFUND_OPERATION_REPOSITORY, type IManualRefundOperationRepository } from '../../domain/ports/manual-refund-operation-repository.port';
import { isManualRefundEvidenceKey, manualRefundEvidenceKeyPrefix } from '../../domain/manual-refund-evidence-key';

const TTL_MS = 24 * 60 * 60 * 1000;
const TYPES = ['application/pdf', 'image/jpeg', 'image/png'] as const;

@Injectable()
export class CreateManualRefundEvidenceUploadUseCase {
  constructor(@Inject(MANUAL_REFUND_OPERATION_REPOSITORY) private readonly operations: IManualRefundOperationRepository, @Inject(MANUAL_REFUND_EVIDENCE_REPOSITORY) private readonly evidence: IManualRefundEvidenceRepository, @Inject(STORAGE_PORT) private readonly storage: StoragePort, private readonly tenantDb: TenantDbService) {}
  async execute(tenantId: string, operationId: string, input: CreateManualRefundEvidenceUploadInput, actorUserId: string): Promise<ManualRefundEvidenceUploadResponse> {
    if (!TYPES.includes(input.contentType) || input.sizeBytes > MAX_MANUAL_REFUND_EVIDENCE_SIZE_BYTES) throw new ManualRefundEvidenceUploadInvalid();
    const grant = await this.storage.createPrivatePresignedUpload({ keyPrefix: manualRefundEvidenceKeyPrefix(tenantId, operationId), contentType: input.contentType, contentLength: input.sizeBytes, writeOnce: true });
    if (!isManualRefundEvidenceKey(tenantId, operationId, grant.key)) throw new ManualRefundEvidenceUploadInvalid();
    await this.tenantDb.forTenant(tenantId, async (tx) => {
      const operation = await this.operations.findById(tx, tenantId, operationId);
      if (!operation || operation.tenantId !== tenantId) throw new ManualRefundOperationNotFound();
      if (operation.makerUserId !== actorUserId || operation.version !== input.expectedVersion) throw new ManualRefundConcurrentUpdate();
      const now = await this.tenantDb.databaseNow(tx);
      await this.evidence.createUpload(tx, tenantId, { operationId, objectKey: grant.key, checksum: input.checksum, sizeBytes: input.sizeBytes, contentType: input.contentType, expiresAt: new Date(now.getTime() + TTL_MS) });
    });
    return grant;
  }
}
