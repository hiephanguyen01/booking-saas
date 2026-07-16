import { Inject, Injectable, NotFoundException } from '@nestjs/common';
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
  type AffiliateCommissionWithBooking,
  type IAffiliateCommissionRepository,
} from '../../domain/ports/affiliate-commission-repository.port';
import {
  REFERRAL_LINK_REPOSITORY,
  type IReferralLinkRepository,
  type ReferralLinkRecord,
} from '../../domain/ports/referral-link-repository.port';
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
    @Inject(AFFILIATE_REPOSITORY) private readonly affiliates: IAffiliateRepository,
    @Inject(REFERRAL_LINK_REPOSITORY) private readonly links: IReferralLinkRepository,
    @Inject(AFFILIATE_COMMISSION_REPOSITORY) private readonly commissions: IAffiliateCommissionRepository,
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
