import { Inject, Injectable } from '@nestjs/common';
import type { ListingRevisionResponse } from '@booking/contracts';
import { TenantDbService } from '../../../../../shared/tenant-context/tenant-db.service';
import {
  LISTING_REPOSITORY,
  type IListingRepository,
} from '../../../domain/ports/listing-repository.port';
import {
  LISTING_REVISION_REPOSITORY,
  type IListingRevisionRepository,
} from '../../../domain/ports/listing-revision-repository.port';
import { Listing } from '../../../domain/entities/listing.entity';
import { ListingNotFound } from '../../../domain/errors/listing-errors';
import { toListingRevisionResponse } from '../../listing-revision.mapper';

/**
 * The edit a listing currently has open: the pending one, or the latest rejection
 * so the partner keeps their content and reads why it came back (§7.3). `null`
 * means the form shows the live listing.
 */
@Injectable()
export class GetListingRevisionUseCase {
  constructor(
    @Inject(LISTING_REPOSITORY) private readonly listings: IListingRepository,
    @Inject(LISTING_REVISION_REPOSITORY)
    private readonly revisions: IListingRevisionRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(
    tenantId: string,
    listingId: string,
    opts: { requirePartnerId?: string; pendingOnly?: boolean } = {},
  ): Promise<ListingRevisionResponse | null> {
    return this.tenantDb.forTenant(tenantId, async (tx) => {
      const listing = await this.listings.findById(tx, listingId);
      if (!listing) throw new ListingNotFound();
      Listing.rehydrate(listing).assertOwnedForEdit(opts.requirePartnerId);

      const revision = opts.pendingOnly
        ? await this.revisions.findPending(tx, 'listing', listingId)
        : await this.revisions.findOpen(tx, 'listing', listingId);
      return revision ? toListingRevisionResponse(revision, listing) : null;
    });
  }
}
