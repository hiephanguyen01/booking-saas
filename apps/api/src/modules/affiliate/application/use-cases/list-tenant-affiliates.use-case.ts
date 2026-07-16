import { Inject, Injectable } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { resolveEffectiveAffiliateRate, type EffectiveAffiliateRate } from '../../domain/affiliate-rate';
import {
  AFFILIATE_REPOSITORY,
  type AffiliateWithUser,
  type IAffiliateRepository,
} from '../../domain/ports/affiliate-repository.port';
import {
  AFFILIATE_COMMISSION_REPOSITORY,
  type AffiliateCommissionTotals,
  type IAffiliateCommissionRepository,
} from '../../domain/ports/affiliate-commission-repository.port';
import {
  REFERRAL_LINK_REPOSITORY,
  type IReferralLinkRepository,
} from '../../domain/ports/referral-link-repository.port';
import {
  COMMISSION_RULE_READER,
  type ICommissionRuleReader,
} from '../../domain/ports/commission-rule-reader.port';

export interface TenantAffiliateRow {
  affiliate: AffiliateWithUser;
  linksCount: number;
  clicks: number;
  totals: AffiliateCommissionTotals;
  effectiveRate: EffectiveAffiliateRate;
}

/**
 * List every affiliate for the tenant with its funnel (clicks/bookings), the
 * per-status commission totals and the rate it is actually paid at (§15.3).
 *
 * The totals are passed through per status rather than pre-summed: this is the
 * page a tenant uses to decide what to pay, and `pending` (not owed yet),
 * `confirmed` (owed now) and `paid` (already settled) are three different answers
 * to that question.
 */
@Injectable()
export class ListTenantAffiliatesUseCase {
  constructor(
    @Inject(AFFILIATE_REPOSITORY) private readonly affiliates: IAffiliateRepository,
    @Inject(REFERRAL_LINK_REPOSITORY) private readonly links: IReferralLinkRepository,
    @Inject(AFFILIATE_COMMISSION_REPOSITORY) private readonly commissions: IAffiliateCommissionRepository,
    @Inject(COMMISSION_RULE_READER) private readonly rules: ICommissionRuleReader,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(tenantId: string): Promise<TenantAffiliateRow[]> {
    return this.tenantDb.forTenant(tenantId, async (tx) => {
      // One rule read for the whole page — the baseline is per tenant, not per row.
      const [affiliates, rule] = await Promise.all([
        this.affiliates.list(tx),
        this.rules.findTenantDefault(tx),
      ]);
      return Promise.all(
        affiliates.map(async (affiliate) => {
          const [linksCount, clicks, totals] = await Promise.all([
            this.links.countByAffiliate(tx, affiliate.id),
            this.links.totalClicksForAffiliate(tx, affiliate.id),
            this.commissions.totalsForAffiliate(tx, affiliate.id),
          ]);
          return {
            affiliate,
            linksCount,
            clicks,
            totals,
            effectiveRate: resolveEffectiveAffiliateRate(affiliate.customRate, rule),
          };
        }),
      );
    });
  }
}
