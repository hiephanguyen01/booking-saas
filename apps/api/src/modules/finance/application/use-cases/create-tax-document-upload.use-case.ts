import { Inject, Injectable } from '@nestjs/common';
import {
  STORAGE_PORT,
  type PrivatePresignedUpload,
  type StoragePort,
} from '../../../storage/domain/ports/storage.port';
import { taxDocumentKeyPrefix } from '../../domain/tax-document-key';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  TAX_COMPLIANCE_REPOSITORY,
  type ITaxComplianceRepository,
} from '../../domain/ports/tax-compliance-repository.port';

const UPLOAD_RECORD_TTL_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class CreateTaxDocumentUploadUseCase {
  constructor(
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
    @Inject(TAX_COMPLIANCE_REPOSITORY)
    private readonly tax: ITaxComplianceRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(
    tenantId: string,
    input: { contentType: 'application/pdf'; sizeBytes: number; checksum: string },
  ): Promise<PrivatePresignedUpload> {
    const grant = await this.storage.createPrivatePresignedUpload({
      keyPrefix: taxDocumentKeyPrefix(tenantId),
      contentType: input.contentType,
      contentLength: input.sizeBytes,
      writeOnce: true,
    });
    await this.tenantDb.forTenant(tenantId, (tx) =>
      this.tax.createDocumentUpload(tx, tenantId, {
        objectKey: grant.key,
        checksum: input.checksum,
        sizeBytes: input.sizeBytes,
        contentType: input.contentType,
        expiresAt: new Date(Date.now() + UPLOAD_RECORD_TTL_MS),
      }),
    );
    return grant;
  }
}
