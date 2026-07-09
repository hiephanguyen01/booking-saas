import { Inject, Injectable } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  COMMISSION_RULE_REPOSITORY,
  type CommissionRuleRecord,
  type ICommissionRuleRepository,
} from '../../domain/ports/commission-rule-repository.port';

/** List a tenant's commission rules (§3.2). */
@Injectable()
export class ListCommissionRulesUseCase {
  constructor(
    @Inject(COMMISSION_RULE_REPOSITORY) private readonly rules: ICommissionRuleRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  execute(tenantId: string): Promise<CommissionRuleRecord[]> {
    return this.tenantDb.forTenant(tenantId, (tx) => this.rules.list(tx));
  }
}
