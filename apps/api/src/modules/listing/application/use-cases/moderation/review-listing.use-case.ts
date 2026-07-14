import { Inject, Injectable } from '@nestjs/common';
import type { ListingReviewResponse } from '@booking/contracts';
import { TenantDbService } from '../../../../../shared/tenant-context/tenant-db.service';
import {
  LISTING_REPOSITORY,
  type IListingRepository,
} from '../../../domain/ports/listing-repository.port';
import { buildListingReview } from '../../moderation/build-listing-review';
import { listingNotFound } from '../../moderation/moderation-support';

/** Read model a tenant reviewer sees: submission checklist + contact-info flags. */
@Injectable()
export class ReviewListingUseCase {
  constructor(
    @Inject(LISTING_REPOSITORY) private readonly listings: IListingRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(tenantId: string, listingId: string): Promise<ListingReviewResponse> {
    const listing = await this.tenantDb.forTenant(tenantId, (tx) =>
      this.listings.findById(tx, listingId),
    );
    if (!listing) listingNotFound();
    return buildListingReview(listing);
  }
}
