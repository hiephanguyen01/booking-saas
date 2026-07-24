import { Inject, Injectable } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  LISTING_REPOSITORY,
  type IListingRepository,
  type ListingRecord,
} from '../../domain/ports/listing-repository.port';
import { ListingNotFound, ListingNotOwned } from '../../domain/errors/listing-errors';

/** Options for scope-restricting a read (e.g. a partner may only fetch its own). */
export interface GetListingOptions {
  /** When set, the listing must belong to this partner or a 403 is thrown. */
  requirePartnerId?: string;
}

@Injectable()
export class GetListingUseCase {
  constructor(
    @Inject(LISTING_REPOSITORY) private readonly listings: IListingRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(tenantId: string, id: string, opts?: GetListingOptions): Promise<ListingRecord> {
    const listing = await this.tenantDb.forTenant(tenantId, (tx) => this.listings.findById(tx, id));
    if (!listing) {
      throw new ListingNotFound();
    }
    if (opts?.requirePartnerId && listing.partnerId !== opts.requirePartnerId) {
      throw new ListingNotOwned();
    }
    return listing;
  }
}
