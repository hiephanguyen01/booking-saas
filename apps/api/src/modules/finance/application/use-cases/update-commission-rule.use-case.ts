import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { UpdateCommissionRuleInput } from '@booking/shared';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  COMMISSION_RULE_REPOSITORY,
  type CommissionRuleRecord,
  type ICommissionRuleRepository,
  type UpdateCommissionRuleData,
} from '../../domain/ports/commission-rule-repository.port';

/** Update a commission rule (§3.2) — the platform fee % is intentionally not editable here. */
@Injectable()
export class UpdateCommissionRuleUseCase {
  constructor(
    @Inject(COMMISSION_RULE_REPOSITORY) private readonly rules: ICommissionRuleRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  execute(tenantId: string, id: string, input: UpdateCommissionRuleInput): Promise<CommissionRuleRecord> {
    return this.tenantDb.forTenant(tenantId, async (tx) => {
      const found = await this.rules.findById(tx, id);
      if (!found) throw new NotFoundException({ statusCode: 404, code: 'RULE_NOT_FOUND', message: 'Commission rule not found' });
      return this.rules.update(tx, id, toPartialData(input));
    });
  }
}

function toPartialData(input: UpdateCommissionRuleInput): UpdateCommissionRuleData {
  const data: UpdateCommissionRuleData = {};
  if (input.appliesTo !== undefined) data.appliesTo = input.appliesTo;
  if (input.listingTypeId !== undefined) data.listingTypeId = input.listingTypeId ?? null;
  if (input.categoryId !== undefined) data.categoryId = input.categoryId ?? null;
  if (input.partnerId !== undefined) data.partnerId = input.partnerId ?? null;
  if (input.tenantRateType !== undefined) data.tenantRateType = input.tenantRateType;
  if (input.tenantRate !== undefined) data.tenantRate = BigInt(input.tenantRate);
  if (input.affiliateRateType !== undefined) data.affiliateRateType = input.affiliateRateType;
  if (input.affiliateRate !== undefined) data.affiliateRate = BigInt(input.affiliateRate);
  if (input.effectiveFrom !== undefined) data.effectiveFrom = input.effectiveFrom ? new Date(input.effectiveFrom) : null;
  if (input.effectiveTo !== undefined) data.effectiveTo = input.effectiveTo ? new Date(input.effectiveTo) : null;
  return data;
}
