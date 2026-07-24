import { Inject, Injectable } from '@nestjs/common';
import type { UpdateCommissionRuleInput } from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  COMMISSION_RULE_REPOSITORY,
  type CommissionRuleRecord,
  type ICommissionRuleRepository,
} from '../../domain/ports/commission-rule-repository.port';
import { isHousePartner } from '../is-house-partner';
import { CommissionRule } from '../../domain/entities/commission-rule.entity';
import { CommissionRuleNotFound } from '../../domain/errors/finance-domain-errors';

/** Update a commission rule (§3.2) — the platform fee % is intentionally not editable here. */
@Injectable()
export class UpdateCommissionRuleUseCase {
  constructor(
    @Inject(COMMISSION_RULE_REPOSITORY) private readonly rules: ICommissionRuleRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  execute(
    tenantId: string,
    id: string,
    input: UpdateCommissionRuleInput,
  ): Promise<CommissionRuleRecord> {
    return this.tenantDb.forTenant(tenantId, async (tx) => {
      const found = await this.rules.findById(tx, id);
      if (!found) throw new CommissionRuleNotFound();

      // Merge the change onto the current rule and re-check the tenant-share floor (§3.3).
      const aggregate = CommissionRule.rehydrate(found);
      const { appliesTo, partnerId } = aggregate.targetAfter(input);
      const isHouse =
        appliesTo === 'partner' && partnerId ? await isHousePartner(tx, partnerId) : false;
      const { candidate, patch } = aggregate.proposeUpdate(input, isHouse);
      const incompatible = await this.rules.findIncompatibleListingsForRule(tx, candidate, id);
      CommissionRule.assertDepositCoverage(incompatible);

      return this.rules.update(tx, id, patch);
    });
  }
}
