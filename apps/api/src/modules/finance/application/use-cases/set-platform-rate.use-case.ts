import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  COMMISSION_RULE_REPOSITORY,
  type CommissionRuleRecord,
  type ICommissionRuleRepository,
} from '../../domain/ports/commission-rule-repository.port';
import { TENANT_SHARE_FLOOR_CODE, violatesTenantShareFloor } from '../../domain/commission-rate-guard';
import { isHousePartner } from '../is-house-partner';

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
      if (!found) throw new NotFoundException({ statusCode: 404, code: 'RULE_NOT_FOUND', message: 'Commission rule not found' });

      // The new platform% must still leave the tenant share non-negative (§3.3/§7.7).
      const isHouse = found.appliesTo === 'partner' && found.partnerId ? await isHousePartner(tx, found.partnerId) : false;
      if (
        violatesTenantShareFloor({
          tenantRateType: found.tenantRateType,
          tenantRate: found.tenantRate,
          platformRate,
          affiliateRateType: found.affiliateRateType,
          affiliateRate: found.affiliateRate,
          isHouse,
        })
      ) {
        throw new BadRequestException({
          statusCode: 400,
          code: TENANT_SHARE_FLOOR_CODE,
          message: 'platform% + affiliate% must not exceed the tenant commission% (the tenant share would go negative)',
        });
      }

      return this.rules.setPlatformRate(tx, id, platformRate);
    });
  }
}
