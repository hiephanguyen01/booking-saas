import { Inject, Injectable } from '@nestjs/common';
import type { CreateCommissionRuleInput } from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  COMMISSION_RULE_REPOSITORY,
  type CommissionRuleRecord,
  type ICommissionRuleRepository,
} from '../../domain/ports/commission-rule-repository.port';
import { isHousePartner } from '../is-house-partner';
import { CommissionRule } from '../../domain/entities/commission-rule.entity';

/**
 * Create a commission rule (§3.2). `platform_rate` is platform-admin-only (§7.7),
 * so a new rule inherits it from the tenant default — never silently 0.
 */
@Injectable()
export class CreateCommissionRuleUseCase {
  constructor(
    @Inject(COMMISSION_RULE_REPOSITORY) private readonly rules: ICommissionRuleRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  execute(tenantId: string, input: CreateCommissionRuleInput): Promise<CommissionRuleRecord> {
    return this.tenantDb.forTenant(tenantId, async (tx) => {
      const existing = await this.rules.list(tx);
      const platformRate =
        existing.find((r) => r.appliesTo === 'tenant_default')?.platformRate ?? 0;

      const isHouse =
        input.appliesTo === 'partner' && input.partnerId
          ? await isHousePartner(tx, input.partnerId)
          : false;
      const data = CommissionRule.create(input, platformRate, isHouse);
      const incompatible = await this.rules.findIncompatibleListingsForRule(tx, data);
      CommissionRule.assertDepositCoverage(incompatible);

      return this.rules.create(tx, tenantId, data);
    });
  }
}
