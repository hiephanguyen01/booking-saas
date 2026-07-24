import { Inject, Injectable } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { ResolveTenantByHostUseCase } from '../../../tenancy/application/use-cases/resolve-tenant-by-host.use-case';
import {
  GROUP_OVERFETCH_FACTOR,
  featuredListingLimit,
  uniquePublicListingRecords,
} from '../featured-listings';
import {
  LISTING_READ_REPOSITORY,
  type IListingReadRepository,
  type PublicListingFilter,
  type PublicListingRecord,
} from '../../domain/ports/listing-read-repository.port';

/** Storefront listing results, filtered by type + dynamic `attr.*` (read-only). */
@Injectable()
export class ListPublicListingsUseCase {
  constructor(
    @Inject(LISTING_READ_REPOSITORY) private readonly listings: IListingReadRepository,
    private readonly resolveTenant: ResolveTenantByHostUseCase,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(host: string, filter: PublicListingFilter): Promise<PublicListingRecord[]> {
    const tenant = await this.resolveTenant.execute(host);
    return this.tenantDb.forTenant(tenant.id, (tx) => this.listings.findPublished(tx, filter));
  }

  async featured(host: string, requestedLimit: number): Promise<PublicListingRecord[]> {
    const limit = featuredListingLimit(requestedLimit);
    const rows = await this.execute(host, {
      attrFilters: {},
      limit: limit * GROUP_OVERFETCH_FACTOR,
    });
    return uniquePublicListingRecords(rows, limit);
  }
}
