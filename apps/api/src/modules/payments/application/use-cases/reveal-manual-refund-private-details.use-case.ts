import type {
  ManualRefundPrivateDetailsResponse,
  RevealManualRefundPrivateDetailsInput,
} from '@booking/contracts';
import { Inject, Injectable } from '@nestjs/common';
import { AUDIT_WRITER, type IAuditWriter } from '../../../../shared/audit/audit-writer.port';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { STORAGE_PORT, type StoragePort } from '../../../storage/domain/ports/storage.port';
import {
  ManualRefundDestinationRequired,
  ManualRefundEvidenceUploadInvalid,
  ManualRefundOperationNotFound,
} from '../../domain/errors/manual-refund-errors';
import { isManualRefundEvidenceKey } from '../../domain/manual-refund-evidence-key';
import {
  MANUAL_REFUND_OPERATION_REPOSITORY,
  type IManualRefundOperationRepository,
} from '../../domain/ports/manual-refund-operation-repository.port';
import {
  MANUAL_REFUND_PII_CRYPTO,
  type ManualRefundPiiCryptoPort,
} from '../../domain/ports/manual-refund-pii-crypto.port';
import { toManualRefundPrivateDetailsResponse } from '../manual-refund.mapper';

export interface ManualRefundPrivateDetailsViewer {
  userId: string;
  ip?: string | null;
}

@Injectable()
export class RevealManualRefundPrivateDetailsUseCase {
  constructor(
    @Inject(MANUAL_REFUND_OPERATION_REPOSITORY)
    private readonly operations: IManualRefundOperationRepository,
    @Inject(MANUAL_REFUND_PII_CRYPTO) private readonly pii: ManualRefundPiiCryptoPort,
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
    @Inject(AUDIT_WRITER) private readonly audit: IAuditWriter,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(
    tenantId: string,
    operationId: string,
    input: RevealManualRefundPrivateDetailsInput,
    viewer: ManualRefundPrivateDetailsViewer,
  ): Promise<ManualRefundPrivateDetailsResponse> {
    const authorized = await this.tenantDb.forTenant(tenantId, async (tx) => {
      const current = await this.operations.findById(tx, tenantId, operationId);
      if (!current) throw new ManualRefundOperationNotFound();
      if (
        !current.destinationBankCode ||
        !current.destinationAccountName ||
        !current.destinationAccountCiphertext ||
        !current.destinationEncryptionKeyVersion
      ) {
        throw new ManualRefundDestinationRequired();
      }
      if (
        current.evidenceObjectKey &&
        !isManualRefundEvidenceKey(tenantId, operationId, current.evidenceObjectKey)
      ) {
        throw new ManualRefundEvidenceUploadInvalid();
      }

      await this.audit.write(tx, {
        tenantId,
        actorUserId: viewer.userId,
        action: 'manual_refund.private_details_revealed',
        entityType: 'manual_refund_operation',
        entityId: operationId,
        ip: viewer.ip ?? null,
        data: {
          reason: input.reason.trim(),
          evidencePresent: Boolean(current.evidenceObjectKey),
        },
      });
      return {
        bankCode: current.destinationBankCode,
        accountName: current.destinationAccountName,
        ciphertext: current.destinationAccountCiphertext,
        keyVersion: current.destinationEncryptionKeyVersion,
        evidenceObjectKey: current.evidenceObjectKey,
      };
    });

    const accountNumber = this.pii.decryptAccountNumber({
      tenantId,
      operationId,
      keyVersion: authorized.keyVersion,
      ciphertext: authorized.ciphertext,
    });
    const evidenceDownload = authorized.evidenceObjectKey
      ? await this.storage.createPrivatePresignedDownload({ key: authorized.evidenceObjectKey })
      : null;
    return toManualRefundPrivateDetailsResponse({
      bankCode: authorized.bankCode,
      accountName: authorized.accountName,
      accountNumber,
      evidenceDownload,
    });
  }
}
