import { Inject, Injectable } from '@nestjs/common';
import type { ListAffiliatesQuery } from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { resolveEffectiveAffiliateRate, type EffectiveAffiliateRate } from '../../domain/affiliate-rate';
import {
  AFFILIATE_READER,
  type AffiliateWithUser,
  type IAffiliateReader,
} from '../../domain/ports/affiliate-reader.port';
import {
  AFFILIATE_COMMISSION_REPOSITORY,
  type AffiliateCommissionTotals,
  type IAffiliateCommissionRepository,
} from '../../domain/ports/affiliate-commission-repository.port';
import {
  REFERRAL_LINK_READER,
  type IReferralLinkReader,
} from '../../domain/ports/referral-link-reader.port';
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
    @Inject(AFFILIATE_READER) private readonly affiliates: IAffiliateReader,
    @Inject(REFERRAL_LINK_READER) private readonly links: IReferralLinkReader,
    @Inject(AFFILIATE_COMMISSION_REPOSITORY) private readonly commissions: IAffiliateCommissionRepository,
    @Inject(COMMISSION_RULE_READER) private readonly rules: ICommissionRuleReader,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(
    tenantId: string,
    query: ListAffiliatesQuery,
  ): Promise<{ items: TenantAffiliateRow[]; total: number; counts: Record<string, number> }> {
    return this.tenantDb.forTenant(tenantId, async (tx) => {
      // One rule read for the whole page — the baseline is per tenant, not per row.
      const [{ items: affiliates, total, counts }, rule] = await Promise.all([
        this.affiliates.list(tx, query),
        this.rules.findTenantDefault(tx),
      ]);
      // Enrichment (links/clicks/commission totals) runs only for the page's rows.
      const items = await Promise.all(
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
      return { items, total, counts };
    });
  }
}
