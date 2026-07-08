import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  LISTING_REPOSITORY,
  type IListingRepository,
  type ListingRecord,
} from '../../domain/ports/listing-repository.port';

@Injectable()
export class GetListingUseCase {
  constructor(
    @Inject(LISTING_REPOSITORY) private readonly listings: IListingRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(tenantId: string, id: string): Promise<ListingRecord> {
    const listing = await this.tenantDb.forTenant(tenantId, (tx) => this.listings.findById(tx, id));
    if (!listing) {
      throw new NotFoundException({
        statusCode: 404,
        code: 'LISTING_NOT_FOUND',
        message: 'Listing not found',
      });
    }
    return listing;
  }
}
