import { Inject, Injectable } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  TAX_COMPLIANCE_REPOSITORY,
  type ITaxComplianceRepository,
  type TaxCertificateRecord,
} from '../../domain/ports/tax-compliance-repository.port';

@Injectable()
export class ListTaxWithholdingCertificatesUseCase {
  constructor(
    @Inject(TAX_COMPLIANCE_REPOSITORY)
    private readonly tax: ITaxComplianceRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  execute(tenantId: string, partnerId?: string): Promise<TaxCertificateRecord[]> {
    return this.tenantDb.forTenant(tenantId, (tx) =>
      this.tax.listCertificates(tx, tenantId, partnerId),
    );
  }
}
