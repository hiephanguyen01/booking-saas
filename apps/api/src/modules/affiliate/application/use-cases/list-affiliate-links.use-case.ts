import { Inject, Injectable } from '@nestjs/common';
import type { ListAffiliateLinksQuery } from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  REFERRAL_LINK_READER,
  type IReferralLinkReader,
  type ReferralLinkRecord,
} from '../../domain/ports/referral-link-reader.port';

/** List an affiliate's referral links (§15.3). */
@Injectable()
export class ListAffiliateLinksUseCase {
  constructor(
    @Inject(REFERRAL_LINK_READER) private readonly links: IReferralLinkReader,
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
