import { Inject, Injectable } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  COMMISSION_RULE_REPOSITORY,
  type CommissionRuleRecord,
  type ICommissionRuleRepository,
} from '../../domain/ports/commission-rule-repository.port';
import { isHousePartner } from '../is-house-partner';
import { CommissionRule } from '../../domain/entities/commission-rule.entity';
import { CommissionRuleNotFound } from '../../domain/errors/finance-domain-errors';

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
      if (!found) throw new CommissionRuleNotFound();

      // The new platform% must still leave the tenant share non-negative (§3.3/§7.7).
      const isHouse =
        found.appliesTo === 'partner' && found.partnerId
          ? await isHousePartner(tx, found.partnerId)
          : false;
      const rate = CommissionRule.rehydrate(found).withPlatformRate(platformRate, isHouse);

      return this.rules.setPlatformRate(tx, id, rate);
    });
  }
}
