import { Inject, Injectable } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { TaxFiling } from '../../domain/entities/tax-filing.entity';
import {
  TaxFilingConcurrentChange,
  TaxFilingNotFound,
} from '../../domain/errors/finance-domain-errors';
import {
  TAX_COMPLIANCE_REPOSITORY,
  type ITaxComplianceRepository,
  type TaxFilingPeriodRecord,
} from '../../domain/ports/tax-compliance-repository.port';

@Injectable()
export class SubmitTaxFilingPeriodUseCase {
  constructor(
    @Inject(TAX_COMPLIANCE_REPOSITORY)
    private readonly tax: ITaxComplianceRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  execute(
    tenantId: string,
    periodId: string,
    submissionReference: string,
    actorId: string,
  ): Promise<TaxFilingPeriodRecord> {
    return this.tenantDb.forTenant(tenantId, async (tx) => {
      const period = await this.tax.findPeriod(tx, periodId);
      if (!period) throw new TaxFilingNotFound();
      TaxFiling.rehydrate(period.status).assertSubmittable();
      const submitted = await this.tax.submitPeriod(
        tx,
        periodId,
        'draft',
        actorId,
        submissionReference,
      );
      if (!submitted) throw new TaxFilingConcurrentChange();
      return submitted;
    });
  }
}
