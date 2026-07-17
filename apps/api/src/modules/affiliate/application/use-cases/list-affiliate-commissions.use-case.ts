import { Inject, Injectable } from '@nestjs/common';
import type { PaginationQuery } from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  AFFILIATE_COMMISSION_REPOSITORY,
  type AffiliateCommissionWithBooking,
  type IAffiliateCommissionRepository,
} from '../../domain/ports/affiliate-commission-repository.port';

/** List an affiliate's commissions with booking codes (§15.3). */
@Injectable()
export class ListAffiliateCommissionsUseCase {
  constructor(
    @Inject(AFFILIATE_COMMISSION_REPOSITORY) private readonly commissions: IAffiliateCommissionRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(
    tenantId: string,
    affiliateId: string,
    query: PaginationQuery,
  ): Promise<{ items: AffiliateCommissionWithBooking[]; total: number }> {
    return this.tenantDb.forTenant(tenantId, (tx) =>
      this.commissions.listByAffiliatePaginated(tx, affiliateId, query),
    );
  }
}
