import { Inject, Injectable } from '@nestjs/common';
import type { ListingReviewResponse } from '@booking/contracts';
import { TenantDbService } from '../../../../../shared/tenant-context/tenant-db.service';
import {
  LISTING_REPOSITORY,
  type IListingRepository,
} from '../../../domain/ports/listing-repository.port';
import {
  LISTING_REVISION_REPOSITORY,
  type IListingRevisionRepository,
} from '../../../domain/ports/listing-revision-repository.port';
import {
  LISTING_REVIEWED_FIELDS,
  mergeRevisionPayload,
} from '../../../domain/revisions/revision-diff';
import { buildListingReview } from '../../moderation/build-listing-review';
import { listingNotFound } from '../../moderation/moderation-support';

/**
 * Read model a tenant reviewer sees: submission checklist + contact-info flags.
 *
 * When an edit is waiting, the gate runs on the listing **as it would be after
 * approval** — otherwise a phone number added to a published listing would never
 * be scanned, since the row itself was screened only at its first publication.
 */
@Injectable()
export class ReviewListingUseCase {
  constructor(
    @Inject(LISTING_REPOSITORY) private readonly listings: IListingRepository,
    @Inject(LISTING_REVISION_REPOSITORY)
    private readonly revisions: IListingRevisionRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(tenantId: string, listingId: string): Promise<ListingReviewResponse> {
    const result = await this.tenantDb.forTenant(tenantId, async (tx) => {
      const listing = await this.listings.findById(tx, listingId);
      if (!listing) return null;
      const pending = await this.revisions.findPending(tx, 'listing', listingId);
      return pending
        ? mergeRevisionPayload(listing, pending.payload, LISTING_REVIEWED_FIELDS)
        : listing;
    });
    if (!result) listingNotFound();
    return buildListingReview(result);
  }
}
