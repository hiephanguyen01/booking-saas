import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { UpdateCommissionRuleInput } from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  COMMISSION_RULE_REPOSITORY,
  type CommissionRuleRecord,
  type ICommissionRuleRepository,
  type UpdateCommissionRuleData,
} from '../../domain/ports/commission-rule-repository.port';
import { TENANT_SHARE_FLOOR_CODE, violatesTenantShareFloor } from '../../domain/commission-rate-guard';
import { isHousePartner } from '../is-house-partner';

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

      // Merge the change onto the current rule and re-check the tenant-share floor (§3.3).
      const appliesTo = input.appliesTo ?? found.appliesTo;
      const partnerId = input.partnerId !== undefined ? (input.partnerId ?? null) : found.partnerId;
      const isHouse = appliesTo === 'partner' && partnerId ? await isHousePartner(tx, partnerId) : false;
      if (
        violatesTenantShareFloor({
          tenantRateType: input.tenantRateType ?? found.tenantRateType,
          tenantRate: input.tenantRate !== undefined ? BigInt(input.tenantRate) : found.tenantRate,
          platformRate: found.platformRate,
          affiliateRateType: input.affiliateRateType ?? found.affiliateRateType,
          affiliateRate: input.affiliateRate !== undefined ? BigInt(input.affiliateRate) : found.affiliateRate,
          isHouse,
        })
      ) {
        throw new BadRequestException({
          statusCode: 400,
          code: TENANT_SHARE_FLOOR_CODE,
          message: 'platform% + affiliate% must not exceed the tenant commission% (the tenant share would go negative)',
        });
      }

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
