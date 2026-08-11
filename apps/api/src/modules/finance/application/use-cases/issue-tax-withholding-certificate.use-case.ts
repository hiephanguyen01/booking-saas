import { Inject, Injectable } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  TAX_COMPLIANCE_REPOSITORY,
  type ITaxComplianceRepository,
  type TaxCertificateRecord,
} from '../../domain/ports/tax-compliance-repository.port';

@Injectable()
export class IssueTaxWithholdingCertificateUseCase {
  constructor(
    @Inject(TAX_COMPLIANCE_REPOSITORY)
    private readonly tax: ITaxComplianceRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  execute(
    tenantId: string,
    partnerId: string,
    taxYear: number,
    input: { certificateNumber: string; fileKey: string; checksum: string },
    actorId: string,
  ): Promise<TaxCertificateRecord> {
    return this.tenantDb.forTenant(tenantId, (tx) =>
      this.tax.issueCertificate(tx, tenantId, partnerId, taxYear, {
        ...input,
        issuedBy: actorId,
      }),
    );
  }
}
