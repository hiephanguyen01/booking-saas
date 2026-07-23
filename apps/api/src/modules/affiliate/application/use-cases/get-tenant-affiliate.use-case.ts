import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { resolveEffectiveAffiliateRate, type EffectiveAffiliateRate } from '../../domain/affiliate-rate';
import {
  AFFILIATE_READER,
  type AffiliateWithUser,
  type IAffiliateReader,
} from '../../domain/ports/affiliate-reader.port';
import {
  AFFILIATE_COMMISSION_READER,
  type AffiliateCommissionTotals,
  type AffiliateCommissionWithBooking,
  type IAffiliateCommissionReader,
} from '../../domain/ports/affiliate-commission-reader.port';
import {
  REFERRAL_LINK_READER,
  type IReferralLinkReader,
  type ReferralLinkRecord,
} from '../../domain/ports/referral-link-reader.port';
import {
  COMMISSION_RULE_READER,
  type ICommissionRuleReader,
} from '../../domain/ports/commission-rule-reader.port';

export interface TenantAffiliateDetail {
  affiliate: AffiliateWithUser;
  links: ReferralLinkRecord[];
  commissions: AffiliateCommissionWithBooking[];
  clicks: number;
  totals: AffiliateCommissionTotals;
  effectiveRate: EffectiveAffiliateRate;
}

/** Full detail for one affiliate: profile + funnel + links + commissions (§15.3). */
@Injectable()
export class GetTenantAffiliateUseCase {
  constructor(
    @Inject(AFFILIATE_READER) private readonly affiliates: IAffiliateReader,
    @Inject(REFERRAL_LINK_READER) private readonly links: IReferralLinkReader,
    @Inject(AFFILIATE_COMMISSION_READER)
    private readonly commissions: IAffiliateCommissionReader,
    @Inject(COMMISSION_RULE_READER) private readonly rules: ICommissionRuleReader,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(tenantId: string, affiliateId: string): Promise<TenantAffiliateDetail> {
    return this.tenantDb.forTenant(tenantId, async (tx) => {
      const affiliate = await this.affiliates.findByUserWithTenant(tx, affiliateId);
      if (!affiliate) {
        throw new NotFoundException({ statusCode: 404, code: 'AFFILIATE_NOT_FOUND', message: 'Affiliate not found' });
      }
      const [links, commissions, totals, clicks, rule] = await Promise.all([
        this.links.listByAffiliate(tx, affiliateId),
        this.commissions.listByAffiliate(tx, affiliateId),
        this.commissions.totalsForAffiliate(tx, affiliateId),
        this.links.totalClicksForAffiliate(tx, affiliateId),
        this.rules.findTenantDefault(tx),
      ]);
      return {
        affiliate,
        links,
        commissions,
        clicks,
        totals,
        effectiveRate: resolveEffectiveAffiliateRate(affiliate.customRate, rule),
      };
    });
  }
}
