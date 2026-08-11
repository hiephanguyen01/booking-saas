import { Inject, Injectable } from '@nestjs/common';
import { MAX_TAX_DOCUMENT_SIZE_BYTES } from '@booking/contracts';
import { AUDIT_WRITER, type IAuditWriter } from '../../../../shared/audit/audit-writer.port';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { STORAGE_PORT, type StoragePort } from '../../../storage/domain/ports/storage.port';
import {
  InvalidTaxDocumentKey,
  TaxCertificateAlreadyIssued,
  TaxCertificateConcurrentChange,
  TaxCertificateNoWithholding,
  TaxCertificateYearNotClosed,
  TaxCertificateYearUnsettled,
  TaxDocumentUploadExpired,
  TaxDocumentUploadInvalid,
} from '../../domain/errors/finance-domain-errors';
import {
  TAX_COMPLIANCE_REPOSITORY,
  type ITaxComplianceRepository,
  type TaxCertificateRecord,
} from '../../domain/ports/tax-compliance-repository.port';
import { isTaxDocumentKeyForTenant } from '../../domain/tax-document-key';

const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

@Injectable()
export class IssueTaxWithholdingCertificateUseCase {
  constructor(
    @Inject(TAX_COMPLIANCE_REPOSITORY)
    private readonly tax: ITaxComplianceRepository,
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
    @Inject(AUDIT_WRITER) private readonly audit: IAuditWriter,
    private readonly outbox: OutboxService,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(
    tenantId: string,
    partnerId: string,
    taxYear: number,
    input: { certificateNumber: string; fileKey: string },
    actorId: string,
  ): Promise<TaxCertificateRecord> {
    if (!isTaxDocumentKeyForTenant(tenantId, input.fileKey)) {
      throw new InvalidTaxDocumentKey();
    }
    if (taxYear >= vietnamTaxYear(new Date())) {
      throw new TaxCertificateYearNotClosed();
    }

    const inspection = await this.storage.inspectPrivatePdf({
      key: input.fileKey,
      maxSizeBytes: MAX_TAX_DOCUMENT_SIZE_BYTES,
    });
    if (!inspection.valid) {
      throw new TaxDocumentUploadInvalid(
        `The private tax PDF failed verification (${inspection.reason ?? 'unknown'})`,
      );
    }

    return this.tenantDb.forTenant(tenantId, async (tx) => {
      await this.tax.lockCertificateYear(tx, tenantId, partnerId, taxYear);
      const upload = await this.tax.findDocumentUpload(tx, tenantId, input.fileKey);
      if (!upload || upload.status !== 'pending') {
        throw new TaxDocumentUploadInvalid('The PDF is not a pending upload for this tenant');
      }
      const now = new Date();
      if (upload.expiresAt <= now) throw new TaxDocumentUploadExpired();
      if (
        upload.checksum !== inspection.checksum ||
        upload.sizeBytes !== inspection.sizeBytes ||
        upload.contentType !== inspection.contentType
      ) {
        throw new TaxDocumentUploadInvalid(
          'The stored PDF does not match its registered checksum or metadata',
        );
      }

      const readiness = await this.tax.certificateReadiness(tx, tenantId, partnerId, taxYear);
      if (
        readiness.eventCount === 0 ||
        readiness.vatAmount < 0n ||
        readiness.pitAmount < 0n ||
        readiness.vatAmount + readiness.pitAmount <= 0n
      ) {
        throw new TaxCertificateNoWithholding();
      }
      if (readiness.unsettledEventCount > 0) {
        throw new TaxCertificateYearUnsettled(readiness.unsettledEventCount);
      }
      if (await this.tax.findActiveCertificate(tx, tenantId, partnerId, taxYear)) {
        throw new TaxCertificateAlreadyIssued();
      }
      const latest = await this.tax.findLatestCertificate(tx, tenantId, partnerId, taxYear);
      if (!(await this.tax.attachDocumentUpload(tx, tenantId, upload.id, now))) {
        throw new TaxCertificateConcurrentChange();
      }
      const certificate = await this.tax.createCertificate(tx, tenantId, partnerId, taxYear, {
        certificateNumber: input.certificateNumber,
        fileKey: input.fileKey,
        checksum: inspection.checksum,
        issuedBy: actorId,
        version: (latest?.version ?? 0) + 1,
        supersedesId: latest?.id ?? null,
        documentUploadId: upload.id,
        vatAmount: readiness.vatAmount,
        pitAmount: readiness.pitAmount,
      });
      await this.audit.write(tx, {
        tenantId,
        actorUserId: actorId,
        action: 'tax_certificate.issued',
        entityType: 'tax_withholding_certificate',
        entityId: certificate.id,
        data: {
          partnerId,
          taxYear,
          version: certificate.version,
          certificateNumber: certificate.certificateNumber,
          checksum: inspection.checksum,
        },
      });
      await this.outbox.emit(tx, {
        tenantId,
        eventType: 'tax.certificate_issued',
        payload: {
          certificateId: certificate.id,
          partnerId,
          taxYear,
          certificateNumber: certificate.certificateNumber,
        },
      });
      return certificate;
    });
  }
}

function vietnamTaxYear(value: Date): number {
  return new Date(value.getTime() + VN_OFFSET_MS).getUTCFullYear();
}
