import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  TENANT_SHARE_FLOOR_CODE,
  violatesTenantShareFloor,
} from '../../../finance/domain/commission-rate-guard';
import { resolveEffectiveAffiliateRate, type EffectiveAffiliateRate } from '../../domain/affiliate-rate';
import {
  AFFILIATE_REPOSITORY,
  type AffiliateRecord,
  type IAffiliateRepository,
} from '../../domain/ports/affiliate-repository.port';
import {
  COMMISSION_RULE_READER,
  type CommissionRuleSnapshot,
  type ICommissionRuleReader,
} from '../../domain/ports/commission-rule-reader.port';

export interface UpdatedAffiliateRate {
  affiliate: AffiliateRecord;
  /** The rate now in force — the rule's rate when the override was cleared. */
  effectiveRate: EffectiveAffiliateRate;
}

/**
 * Set (or clear) an affiliate's `custom_rate` (§15.2). A custom rate is a whole
 * percent; before saving it is checked against the tenant-default commission rule
 * so `platform% + affiliate% ≤ tenant%` still holds (§3.3) — the same guard the
 * commission-rule editor uses. Clearing (null) always passes.
 *
 * Returns the resolved effective rate alongside the row: clearing the override
 * hands back `customRate: null`, from which the caller cannot tell what the
 * affiliate is now paid — that answer is the rule's rate, resolved here.
 */
@Injectable()
export class UpdateAffiliateRateUseCase {
  constructor(
    @Inject(AFFILIATE_REPOSITORY) private readonly affiliates: IAffiliateRepository,
    @Inject(COMMISSION_RULE_READER) private readonly rules: ICommissionRuleReader,
    private readonly tenantDb: TenantDbService,
  ) {}

  /**
   * `customRateInput` is the raw contract value — a whole-percent digit string or
   * null to clear the override. The bigint conversion lives here (not the
   * controller) so the HTTP layer stays free of money parsing.
   */
  async execute(
    tenantId: string,
    affiliateId: string,
    customRateInput: string | null,
  ): Promise<UpdatedAffiliateRate> {
    const customRate = customRateInput === null ? null : BigInt(customRateInput);
    return this.tenantDb.forTenant(tenantId, async (tx) => {
      const [existing, rule] = await Promise.all([
        this.affiliates.findById(tx, affiliateId),
        this.rules.findTenantDefault(tx),
      ]);
      if (!existing) {
        throw new NotFoundException({ statusCode: 404, code: 'AFFILIATE_NOT_FOUND', message: 'Affiliate not found' });
      }
      if (customRate !== null) this.assertWithinTenantShare(rule, customRate);
      const affiliate = await this.affiliates.setCustomRate(tx, affiliateId, customRate);
      return { affiliate, effectiveRate: resolveEffectiveAffiliateRate(customRate, rule) };
    });
  }

  /** Guard the custom rate against the tenant-default rule (percent rules only). */
  private assertWithinTenantShare(rule: CommissionRuleSnapshot | null, customRate: bigint): void {
    if (!rule) return; // no baseline rule → nothing to compare against
    const violates = violatesTenantShareFloor({
      tenantRateType: rule.tenantRateType,
      tenantRate: rule.tenantRate,
      platformRate: rule.platformRate,
      affiliateRateType: 'percent',
      affiliateRate: customRate,
      isHouse: false,
    });
    if (violates) {
      throw new BadRequestException({
        statusCode: 400,
        code: TENANT_SHARE_FLOOR_CODE,
        message: 'platform% + affiliate% would exceed the tenant commission',
      });
    }
  }
}
