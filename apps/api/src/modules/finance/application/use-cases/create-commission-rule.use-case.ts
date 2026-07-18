import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type { CreateCommissionRuleInput } from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  COMMISSION_RULE_REPOSITORY,
  type CommissionRuleRecord,
  type ICommissionRuleRepository,
} from '../../domain/ports/commission-rule-repository.port';
import {
  TENANT_SHARE_FLOOR_CODE,
  violatesTenantShareFloor,
} from '../../domain/commission-rate-guard';
import { isHousePartner } from '../is-house-partner';

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
      if (
        violatesTenantShareFloor({
          tenantRateType: input.tenantRateType,
          tenantRate: BigInt(input.tenantRate),
          platformRate,
          affiliateRateType: input.affiliateRateType,
          affiliateRate: BigInt(input.affiliateRate),
          isHouse,
        })
      ) {
        throw new BadRequestException({
          statusCode: 400,
          code: TENANT_SHARE_FLOOR_CODE,
          message:
            'platform% + affiliate% must not exceed the tenant commission% (the tenant share would go negative)',
        });
      }
      const data = {
        appliesTo: input.appliesTo,
        listingTypeId: input.listingTypeId ?? null,
        categoryId: input.categoryId ?? null,
        partnerId: input.partnerId ?? null,
        tenantRateType: input.tenantRateType,
        tenantRate: BigInt(input.tenantRate),
        platformRate,
        affiliateRateType: input.affiliateRateType,
        affiliateRate: BigInt(input.affiliateRate),
        effectiveFrom: input.effectiveFrom ? new Date(input.effectiveFrom) : null,
        effectiveTo: input.effectiveTo ? new Date(input.effectiveTo) : null,
      } as const;
      const incompatible = await this.rules.findIncompatibleListingsForRule(tx, data);
      if (incompatible.count > 0) {
        throw new BadRequestException({
          statusCode: 400,
          code: 'COMMISSION_EXCEEDS_PARTNER_DEPOSIT',
          message: `${incompatible.count} listing(s) would have a deposit below their effective commission`,
          details: { incompatibleListings: incompatible.count, samples: incompatible.samples },
        });
      }

      return this.rules.create(tx, tenantId, data);
    });
  }
}
