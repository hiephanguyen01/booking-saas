import { Inject, Injectable } from '@nestjs/common';
import type { DepositRequirementResponse } from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  COMMISSION_COVERAGE_READER,
  type ICommissionCoverageReader,
} from '../../domain/ports/commission-coverage-reader.port';

@Injectable()
export class GetListingDepositRequirementUseCase {
  constructor(
    @Inject(COMMISSION_COVERAGE_READER)
    private readonly commissions: ICommissionCoverageReader,
    private readonly tenantDb: TenantDbService,
  ) {}

  execute(
    tenantId: string,
    partnerId: string,
    listingTypeId: string,
    categoryId: string | null,
  ): Promise<DepositRequirementResponse> {
    return this.tenantDb.forTenant(tenantId, async (tx) => {
      const rule = await this.commissions.findEffectiveRule(tx, {
        partnerId,
        listingTypeId,
        categoryId,
      });
      return {
        minimumDepositPercent:
          rule?.rateType === 'percent' ? Number(rule.rate) : null,
        commissionRuleId: rule?.rateType === 'percent' ? rule.id : null,
      };
    });
  }
}
