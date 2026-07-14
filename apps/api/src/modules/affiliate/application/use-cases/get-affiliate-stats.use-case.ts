import { Inject, Injectable } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  AFFILIATE_COMMISSION_REPOSITORY,
  type IAffiliateCommissionRepository,
} from '../../domain/ports/affiliate-commission-repository.port';
import {
  REFERRAL_LINK_REPOSITORY,
  type IReferralLinkRepository,
} from '../../domain/ports/referral-link-repository.port';

export interface AffiliateStats {
  clicks: number;
  pending: bigint;
  confirmed: bigint;
  paid: bigint;
  bookings: number;
}

/** Aggregate an affiliate's clicks + commission totals for the dashboard (§15.3). */
@Injectable()
export class GetAffiliateStatsUseCase {
  constructor(
    @Inject(AFFILIATE_COMMISSION_REPOSITORY) private readonly commissions: IAffiliateCommissionRepository,
    @Inject(REFERRAL_LINK_REPOSITORY) private readonly links: IReferralLinkRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(tenantId: string, affiliateId: string): Promise<AffiliateStats> {
    return this.tenantDb.forTenant(tenantId, async (tx) => {
      const [totals, clicks] = await Promise.all([
        this.commissions.totalsForAffiliate(tx, affiliateId),
        this.links.totalClicksForAffiliate(tx, affiliateId),
      ]);
      return {
        clicks,
        pending: totals.pending,
        confirmed: totals.confirmed,
        paid: totals.paid,
        bookings: totals.bookings,
      };
    });
  }
}
