import { Inject, Injectable } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { CommissionRule } from '../../domain/entities/commission-rule.entity';
import {
  NEW_TENANT_DEFAULT_COMMISSION,
  NEW_TENANT_PLATFORM_RATE,
} from '../../domain/default-commission-rule';
import {
  COMMISSION_RULE_REPOSITORY,
  type CommissionRuleRecord,
  type ICommissionRuleRepository,
} from '../../domain/ports/commission-rule-repository.port';

/**
 * Idempotently provisions the baseline rule after `tenant.created`.
 *
 * This is deliberately owned by Finance: Tenancy only emits the domain event
 * and never writes another module's tables.
 */
@Injectable()
export class EnsureDefaultCommissionRuleUseCase {
  constructor(
    @Inject(COMMISSION_RULE_REPOSITORY) private readonly rules: ICommissionRuleRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  execute(tenantId: string): Promise<CommissionRuleRecord> {
    return this.tenantDb.forTenant(tenantId, async (tx) => {
      const existing = (await this.rules.list(tx)).find(
        (rule) => rule.appliesTo === 'tenant_default',
      );
      if (existing) return existing;

      const data = CommissionRule.create(
        NEW_TENANT_DEFAULT_COMMISSION,
        NEW_TENANT_PLATFORM_RATE,
        false,
      );
      return this.rules.create(tx, tenantId, data);
    });
  }
}
