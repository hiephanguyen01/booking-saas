import { Inject, Injectable } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  AFFILIATE_REPOSITORY,
  type AffiliateWithUser,
  type IAffiliateRepository,
} from '../../domain/ports/affiliate-repository.port';
import {
  AFFILIATE_COMMISSION_REPOSITORY,
  type IAffiliateCommissionRepository,
} from '../../domain/ports/affiliate-commission-repository.port';
import {
  REFERRAL_LINK_REPOSITORY,
  type IReferralLinkRepository,
} from '../../domain/ports/referral-link-repository.port';

export interface TenantAffiliateRow {
  affiliate: AffiliateWithUser;
  linksCount: number;
  totalEarned: bigint;
}

/** List every affiliate for the tenant with link counts + earned totals (§15.3). */
@Injectable()
export class ListTenantAffiliatesUseCase {
  constructor(
    @Inject(AFFILIATE_REPOSITORY) private readonly affiliates: IAffiliateRepository,
    @Inject(REFERRAL_LINK_REPOSITORY) private readonly links: IReferralLinkRepository,
    @Inject(AFFILIATE_COMMISSION_REPOSITORY) private readonly commissions: IAffiliateCommissionRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(tenantId: string): Promise<TenantAffiliateRow[]> {
    return this.tenantDb.forTenant(tenantId, async (tx) => {
      const affiliates = await this.affiliates.list(tx);
      return Promise.all(
        affiliates.map(async (affiliate) => {
          const [linksCount, totals] = await Promise.all([
            this.links.countByAffiliate(tx, affiliate.id),
            this.commissions.totalsForAffiliate(tx, affiliate.id),
          ]);
          return { affiliate, linksCount, totalEarned: totals.confirmed + totals.paid };
        }),
      );
    });
  }
}
