import { Inject, Injectable } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  LISTING_REPOSITORY,
  type IListingRepository,
  type ListingFilter,
  type ListingRecord,
} from '../../domain/ports/listing-repository.port';

/**
 * One page of the tenant's listings. A tenant accumulates listings across every
 * partner, so `GET /tenant/listings` must not stream the whole table — the
 * partner-scoped list (`ListListingsUseCase`) stays unpaginated (a partner owns
 * few, and the dashboard pickers read them whole).
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
  ): Promise<{ items: ListingRecord[]; total: number }> {
    return this.tenantDb.forTenant(tenantId, (tx) => this.listings.listPage(tx, filter, page));
  }
}
