import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  COMMISSION_RULE_REPOSITORY,
  type CommissionRuleRecord,
  type ICommissionRuleRepository,
} from '../../domain/ports/commission-rule-repository.port';

/** Platform-admin-only: set the platform fee % on a commission rule (§7.7). */
@Injectable()
export class SetPlatformRateUseCase {
  constructor(
    @Inject(COMMISSION_RULE_REPOSITORY) private readonly rules: ICommissionRuleRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  execute(tenantId: string, id: string, platformRate: number): Promise<CommissionRuleRecord> {
    return this.tenantDb.forTenant(tenantId, async (tx) => {
      const found = await this.rules.findById(tx, id);
      if (!found) throw new NotFoundException({ statusCode: 404, code: 'RULE_NOT_FOUND', message: 'Commission rule not found' });
      return this.rules.setPlatformRate(tx, id, platformRate);
    });
  }
}
