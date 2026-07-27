import { Inject, Injectable } from '@nestjs/common';
import {
  type PrismaTx,
  TenantDbService,
} from '../../../../shared/tenant-context/tenant-db.service';
import {
  COMMISSION_RULE_REPOSITORY,
  type ICommissionRuleRepository,
} from '../../domain/ports/commission-rule-repository.port';
import { selectCommissionRule } from '../../domain/commission-rule-precedence';
import {
  defaultCommissionSnapshot,
  type CommissionSnapshot,
} from '../../../../shared/domain/commission/commission-snapshot';

export interface ResolveCommissionTarget {
  partnerId: string;
  listingTypeId: string | null;
  categoryId: string | null;
  isHouse: boolean;
}

/**
 * Resolves the applicable commission rule at booking time and freezes it into an
 * immutable {@link CommissionSnapshot} (§13.1). Called by the booking module INSIDE
 * its `forTenant` transaction so the snapshot commits atomically with the booking.
 * Exported by the finance module; the booking module never touches commission rules
 * directly.
 */
@Injectable()
export class ResolveCommissionUseCase {
  constructor(
    @Inject(COMMISSION_RULE_REPOSITORY) private readonly rules: ICommissionRuleRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(tx: PrismaTx, target: ResolveCommissionTarget): Promise<CommissionSnapshot> {
    const candidates = await this.rules.list(tx);
    const rule = selectCommissionRule(
      candidates,
      {
        partnerId: target.partnerId,
        listingTypeId: target.listingTypeId,
        categoryId: target.categoryId,
      },
      await this.tenantDb.databaseNow(tx),
    );
    if (!rule) return defaultCommissionSnapshot(target.isHouse);
    return {
      ruleId: rule.id,
      appliesTo: rule.appliesTo,
      tenantRateType: rule.tenantRateType,
      tenantRate: rule.tenantRate.toString(),
      platformRate: rule.platformRate,
      affiliateRateType: rule.affiliateRateType,
      affiliateRate: rule.affiliateRate.toString(),
      isHouse: target.isHouse,
    };
  }
}
