import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  AFFILIATE_REPOSITORY,
  type AffiliateWithUser,
  type IAffiliateRepository,
} from '../../domain/ports/affiliate-repository.port';
import {
  AFFILIATE_COMMISSION_REPOSITORY,
  type AffiliateCommissionWithBooking,
  type IAffiliateCommissionRepository,
} from '../../domain/ports/affiliate-commission-repository.port';
import {
  REFERRAL_LINK_REPOSITORY,
  type IReferralLinkRepository,
  type ReferralLinkRecord,
} from '../../domain/ports/referral-link-repository.port';

export interface TenantAffiliateDetail {
  affiliate: AffiliateWithUser;
  links: ReferralLinkRecord[];
  commissions: AffiliateCommissionWithBooking[];
  totalEarned: bigint;
}

/** Full detail for one affiliate: profile + links + commissions (§15.3). */
@Injectable()
export class GetTenantAffiliateUseCase {
  constructor(
    @Inject(AFFILIATE_REPOSITORY) private readonly affiliates: IAffiliateRepository,
    @Inject(REFERRAL_LINK_REPOSITORY) private readonly links: IReferralLinkRepository,
    @Inject(AFFILIATE_COMMISSION_REPOSITORY) private readonly commissions: IAffiliateCommissionRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(tenantId: string, affiliateId: string): Promise<TenantAffiliateDetail> {
    return this.tenantDb.forTenant(tenantId, async (tx) => {
      const affiliate = await this.affiliates.findByUserWithTenant(tx, affiliateId);
      if (!affiliate) {
        throw new NotFoundException({ statusCode: 404, code: 'AFFILIATE_NOT_FOUND', message: 'Affiliate not found' });
      }
      const [links, commissions, totals] = await Promise.all([
        this.links.listByAffiliate(tx, affiliateId),
        this.commissions.listByAffiliate(tx, affiliateId),
        this.commissions.totalsForAffiliate(tx, affiliateId),
      ]);
      return { affiliate, links, commissions, totalEarned: totals.confirmed + totals.paid };
    });
  }
}
