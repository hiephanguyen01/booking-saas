import { Inject, Injectable } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  COMMISSION_RULE_REPOSITORY,
  type ICommissionRuleRepository,
} from '../../domain/ports/commission-rule-repository.port';
import { CommissionRule } from '../../domain/entities/commission-rule.entity';
import { CommissionRuleNotFound } from '../../domain/errors/finance-domain-errors';

/** Delete a commission rule — the tenant default is protected (a booking must always resolve a rate). */
@Injectable()
export class DeleteCommissionRuleUseCase {
  constructor(
    @Inject(COMMISSION_RULE_REPOSITORY) private readonly rules: ICommissionRuleRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  execute(tenantId: string, id: string): Promise<void> {
    return this.tenantDb.forTenant(tenantId, async (tx) => {
      const found = await this.rules.findById(tx, id);
      if (!found) throw new CommissionRuleNotFound();
      CommissionRule.rehydrate(found).assertDeletable();
      await this.rules.delete(tx, id);
    });
  }
}
