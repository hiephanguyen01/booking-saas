import { Inject, Injectable } from '@nestjs/common';
import type { UpdatePlatformRateInput } from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  COMMISSION_RULE_REPOSITORY,
  type CommissionRuleRecord,
  type ICommissionRuleRepository,
} from '../../domain/ports/commission-rule-repository.port';
import { CommissionRule } from '../../domain/entities/commission-rule.entity';
import { isHousePartner } from '../is-house-partner';

/**
 * Platform admin sets a tenant's platform fee % (§7.7). Until this existed the
 * column had no write path at all — changing the 2% meant hand-written SQL.
 *
 * Rewrites EVERY rule of the tenant, not just `tenant_default`: an override
 * copies the platform rate when it is created (`CreateCommissionRuleUseCase`),
 * so leaving overrides behind would keep billing them the old fee.
 *
 * All-or-nothing. If the new rate would push any single rule past the
 * `platform% + affiliate% <= tenant%` floor the whole change is rejected, because
 * a half-applied fee change is worse than a refused one. House-partner rules
 * waive the floor, matching the create/update paths.
 *
 * Past bookings never move: they replay `commission_snapshot` (§13.1).
 */
@Injectable()
export class UpdateTenantPlatformRateUseCase {
  constructor(
    @Inject(COMMISSION_RULE_REPOSITORY) private readonly rules: ICommissionRuleRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  execute(tenantId: string, input: UpdatePlatformRateInput): Promise<CommissionRuleRecord[]> {
    return this.tenantDb.forTenant(tenantId, async (tx) => {
      for (const rule of await this.rules.list(tx)) {
        const isHouse =
          rule.appliesTo === 'partner' && rule.partnerId
            ? await isHousePartner(tx, rule.partnerId)
            : false;
        // Throws CommissionRatesNegativeTenant if this rule cannot carry the fee.
        CommissionRule.rehydrate(rule).withPlatformRate(input.platformRate, isHouse);
      }
      await this.rules.updatePlatformRateForTenant(tx, input.platformRate);
      return this.rules.list(tx);
    });
  }
}
