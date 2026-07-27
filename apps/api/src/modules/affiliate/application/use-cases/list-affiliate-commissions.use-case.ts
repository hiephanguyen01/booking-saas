import { Inject, Injectable } from '@nestjs/common';
import type { ListAffiliateCommissionsQuery } from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import type { RepoPage } from '../../../../shared/pagination/pagination';
import {
  AFFILIATE_COMMISSION_READER,
  type AffiliateCommissionWithBooking,
  type IAffiliateCommissionReader,
} from '../../domain/ports/affiliate-commission-reader.port';

/** List an affiliate's commissions with booking codes (§15.3). */
@Injectable()
export class ListAffiliateCommissionsUseCase {
  constructor(
    @Inject(AFFILIATE_COMMISSION_READER)
    private readonly commissions: IAffiliateCommissionReader,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(
    tenantId: string,
    affiliateId: string,
    query: ListAffiliateCommissionsQuery,
  ): Promise<RepoPage<AffiliateCommissionWithBooking>> {
    return this.tenantDb.forTenant(tenantId, (tx) =>
      this.commissions.listByAffiliatePaginated(tx, affiliateId, query),
    );
  }
}
