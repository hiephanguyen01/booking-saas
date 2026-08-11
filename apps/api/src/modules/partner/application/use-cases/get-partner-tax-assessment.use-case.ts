import { Inject, Injectable } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  PartnerNotFound,
  PartnerTaxAssessmentNotApplicable,
} from '../../domain/errors/partner-errors';
import {
  PARTNER_REPOSITORY,
  type IPartnerRepository,
} from '../../domain/ports/partner-repository.port';
import {
  PARTNER_TAX_REPOSITORY,
  type IPartnerTaxRepository,
  type PartnerTaxAssessmentRecord,
} from '../../domain/ports/partner-tax-repository.port';
import { ensurePartnerTaxAssessment, vietnamTaxPeriod } from '../tax-assessment-support';

@Injectable()
export class GetPartnerTaxAssessmentUseCase {
  constructor(
    @Inject(PARTNER_REPOSITORY) private readonly partners: IPartnerRepository,
    @Inject(PARTNER_TAX_REPOSITORY) private readonly tax: IPartnerTaxRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  execute(
    tenantId: string,
    partnerId: string,
    year?: number,
  ): Promise<{
    assessment: PartnerTaxAssessmentRecord;
    taxStatus: import('@booking/contracts').PartnerTaxStatus;
  }> {
    return this.tenantDb.forTenant(tenantId, async (tx) => {
      const partner = await this.partners.findById(tx, partnerId);
      if (!partner) throw new PartnerNotFound();
      if (
        partner.isHouse ||
        (partner.taxStatus !== 'household_below_threshold' &&
          partner.taxStatus !== 'household_declaring')
      ) {
        throw new PartnerTaxAssessmentNotApplicable();
      }
      const now = await this.tenantDb.databaseNow(tx);
      const taxYear = year ?? vietnamTaxPeriod(now).year;
      const assessment = await ensurePartnerTaxAssessment(tx, this.tax, {
        tenantId,
        partnerId,
        taxYear,
      });
      return { assessment, taxStatus: partner.taxStatus };
    });
  }
}
