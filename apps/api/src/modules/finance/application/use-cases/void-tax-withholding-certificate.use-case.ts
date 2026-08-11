import { Inject, Injectable } from '@nestjs/common';
import { AUDIT_WRITER, type IAuditWriter } from '../../../../shared/audit/audit-writer.port';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  TaxCertificateConcurrentChange,
  TaxCertificateNotFound,
  TaxCertificateNotVoidable,
} from '../../domain/errors/finance-domain-errors';
import {
  TAX_COMPLIANCE_REPOSITORY,
  type ITaxComplianceRepository,
  type TaxCertificateRecord,
} from '../../domain/ports/tax-compliance-repository.port';

@Injectable()
export class VoidTaxWithholdingCertificateUseCase {
  constructor(
    @Inject(TAX_COMPLIANCE_REPOSITORY)
    private readonly tax: ITaxComplianceRepository,
    @Inject(AUDIT_WRITER) private readonly audit: IAuditWriter,
    private readonly outbox: OutboxService,
    private readonly tenantDb: TenantDbService,
  ) {}

  execute(
    tenantId: string,
    certificateId: string,
    reason: string,
    actorId: string,
  ): Promise<TaxCertificateRecord> {
    return this.tenantDb.forTenant(tenantId, async (tx) => {
      const current = await this.tax.findCertificate(tx, tenantId, certificateId);
      if (!current) throw new TaxCertificateNotFound();
      if (current.status !== 'issued') throw new TaxCertificateNotVoidable();
      await this.tax.lockCertificateYear(tx, tenantId, current.partnerId, current.taxYear);
      const certificate = await this.tax.voidCertificate(tx, tenantId, certificateId, {
        voidedAt: new Date(),
        voidedBy: actorId,
        voidReason: reason,
      });
      if (!certificate) throw new TaxCertificateConcurrentChange();
      await this.audit.write(tx, {
        tenantId,
        actorUserId: actorId,
        action: 'tax_certificate.voided',
        entityType: 'tax_withholding_certificate',
        entityId: certificate.id,
        data: {
          partnerId: certificate.partnerId,
          taxYear: certificate.taxYear,
          version: certificate.version,
          certificateNumber: certificate.certificateNumber,
          reason,
        },
      });
      await this.outbox.emit(tx, {
        tenantId,
        eventType: 'tax.certificate_voided',
        payload: {
          certificateId: certificate.id,
          partnerId: certificate.partnerId,
          taxYear: certificate.taxYear,
          certificateNumber: certificate.certificateNumber,
          reason,
        },
      });
      return certificate;
    });
  }
}
