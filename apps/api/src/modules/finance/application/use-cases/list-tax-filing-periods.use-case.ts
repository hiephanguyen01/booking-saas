import { Inject, Injectable } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  TAX_COMPLIANCE_REPOSITORY,
  type ITaxComplianceRepository,
  type TaxFilingPeriodRecord,
} from '../../domain/ports/tax-compliance-repository.port';

@Injectable()
export class ListTaxFilingPeriodsUseCase {
  constructor(
    @Inject(TAX_COMPLIANCE_REPOSITORY)
    private readonly tax: ITaxComplianceRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  execute(tenantId: string): Promise<TaxFilingPeriodRecord[]> {
    return this.tenantDb.forTenant(tenantId, (tx) => this.tax.listPeriods(tx, tenantId));
  }
}
