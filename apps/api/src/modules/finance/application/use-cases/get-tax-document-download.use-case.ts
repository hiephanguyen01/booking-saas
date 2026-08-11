import { Inject, Injectable } from '@nestjs/common';
import { MAX_TAX_DOCUMENT_SIZE_BYTES, type TaxDocumentDownloadResponse } from '@booking/contracts';
import { AUDIT_WRITER, type IAuditWriter } from '../../../../shared/audit/audit-writer.port';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { STORAGE_PORT, type StoragePort } from '../../../storage/domain/ports/storage.port';
import {
  TaxCertificateDocumentUnavailable,
  TaxCertificateNotFound,
  TaxDocumentUploadInvalid,
} from '../../domain/errors/finance-domain-errors';
import {
  TAX_COMPLIANCE_REPOSITORY,
  type ITaxComplianceRepository,
} from '../../domain/ports/tax-compliance-repository.port';
import { isTaxDocumentKeyForTenant } from '../../domain/tax-document-key';

@Injectable()
export class GetTaxDocumentDownloadUseCase {
  constructor(
    @Inject(TAX_COMPLIANCE_REPOSITORY)
    private readonly tax: ITaxComplianceRepository,
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
    @Inject(AUDIT_WRITER) private readonly audit: IAuditWriter,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(
    tenantId: string,
    certificateId: string,
    viewer: { actorId: string; actorType: 'tenant' | 'partner'; partnerId?: string },
  ): Promise<TaxDocumentDownloadResponse> {
    const certificate = await this.tenantDb.forTenant(tenantId, async (tx) => {
      const record = await this.tax.findCertificate(tx, tenantId, certificateId);
      if (!record || (viewer.actorType === 'partner' && record.partnerId !== viewer.partnerId)) {
        throw new TaxCertificateNotFound();
      }
      const statusAllowed =
        record.status === 'issued' || (viewer.actorType === 'tenant' && record.status === 'voided');
      if (!statusAllowed || !record.fileKey || !record.checksum) {
        throw new TaxCertificateDocumentUnavailable();
      }
      await this.audit.write(tx, {
        tenantId,
        actorUserId: viewer.actorId,
        action: 'tax_certificate.download_requested',
        entityType: 'tax_withholding_certificate',
        entityId: record.id,
        data: { viewerType: viewer.actorType, partnerId: viewer.partnerId ?? null },
      });
      return record;
    });
    if (!certificate.fileKey || !isTaxDocumentKeyForTenant(tenantId, certificate.fileKey)) {
      throw new TaxCertificateDocumentUnavailable();
    }

    const inspection = await this.storage.inspectPrivatePdf({
      key: certificate.fileKey,
      maxSizeBytes: MAX_TAX_DOCUMENT_SIZE_BYTES,
    });
    if (!inspection.valid || inspection.checksum !== certificate.checksum) {
      throw new TaxDocumentUploadInvalid(
        'The certificate PDF no longer matches its issued checksum',
      );
    }

    return this.storage.createPrivatePresignedDownload({
      key: certificate.fileKey,
      fileName: `chung-tu-khau-tru-${certificate.certificateNumber ?? certificate.id}.pdf`,
    });
  }
}
