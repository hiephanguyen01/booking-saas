import { Inject, Injectable } from '@nestjs/common';
import type { ListAffiliateLinksQuery } from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  REFERRAL_LINK_REPOSITORY,
  type IReferralLinkRepository,
  type ReferralLinkRecord,
} from '../../domain/ports/referral-link-repository.port';

/** List an affiliate's referral links (§15.3). */
@Injectable()
export class ListAffiliateLinksUseCase {
  constructor(
    @Inject(REFERRAL_LINK_REPOSITORY) private readonly links: IReferralLinkRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(
    tenantId: string,
    affiliateId: string,
    query: ListAffiliateLinksQuery,
  ): Promise<{ items: ReferralLinkRecord[]; total: number }> {
    return this.tenantDb.forTenant(tenantId, (tx) =>
      this.links.listByAffiliatePaginated(tx, affiliateId, query),
    );
  }
}
