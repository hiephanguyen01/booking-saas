import { Inject, Injectable } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import type { RepoPageWithCounts } from '../../../../shared/pagination/pagination';
import {
  LISTING_REPOSITORY,
  type IListingRepository,
  type ListingFilter,
  type ListingRecord,
} from '../../domain/ports/listing-repository.port';

/**
 * One page of the tenant's listings across every partner, filterable by status +
 * a title search, with per-status row counts for the filter tabs. A tenant
 * accumulates listings without bound, so `GET /tenant/listings` is always paged.
 */
@Injectable()
export class ListListingsPageUseCase {
  constructor(
    @Inject(LISTING_REPOSITORY) private readonly listings: IListingRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  execute(
    tenantId: string,
    filter: ListingFilter,
    page: { page: number; pageSize: number },
  ): Promise<RepoPageWithCounts<ListingRecord>> {
    return this.tenantDb.forTenant(tenantId, (tx) => this.listings.listPage(tx, filter, page));
  }
}
