import { Inject, Injectable } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { ResolveTenantByHostUseCase } from '../../../tenancy/application/use-cases/resolve-tenant-by-host.use-case';
import {
  LISTING_REPOSITORY,
  type IListingRepository,
  type PublicListingRecord,
} from '../../domain/ports/listing-repository.port';
import { ListingNotFound } from '../../domain/errors/listing-errors';

/** Storefront listing detail, resolved from the Host. Published listings only. */
@Injectable()
export class GetPublicListingUseCase {
  constructor(
    @Inject(LISTING_REPOSITORY) private readonly listings: IListingRepository,
    private readonly resolveTenant: ResolveTenantByHostUseCase,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(host: string, slug: string): Promise<PublicListingRecord> {
    const tenant = await this.resolveTenant.execute(host);
    const listing = await this.tenantDb.forTenant(tenant.id, (tx) =>
      this.listings.findPublicBySlug(tx, slug),
    );
    if (!listing) {
      throw new ListingNotFound();
    }
    return listing;
  }
}
