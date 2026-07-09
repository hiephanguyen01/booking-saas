import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { TenantDbService } from '../../../../../shared/tenant-context/tenant-db.service';
import { OutboxService } from '../../../../../shared/outbox/outbox.service';
import {
  LISTING_REPOSITORY,
  type IListingRepository,
  type ListingRecord,
} from '../../../domain/ports/listing-repository.port';
import { transitionPublish } from '../../../domain/moderation/listing-moderation';
import { buildListingReview } from '../../moderation/build-listing-review';
import {
  listingNotFound,
  runModeration,
  writeModerationAudit,
  type ModerationContext,
} from '../../moderation/moderation-support';

/**
 * A tenant reviewer publishes a listing (pending_review → published, actor
 * `admin`). Publishing is BLOCKED when the listing still leaks contact info
 * (§7.3) — the reviewer must have the partner remove it first.
 */
@Injectable()
export class PublishListingUseCase {
  constructor(
    @Inject(LISTING_REPOSITORY) private readonly listings: IListingRepository,
    private readonly tenantDb: TenantDbService,
    private readonly outbox: OutboxService,
  ) {}

  async execute(ctx: ModerationContext, listingId: string): Promise<ListingRecord> {
    return this.tenantDb.forTenant(ctx.tenantId, async (tx) => {
      const listing = await this.listings.findById(tx, listingId);
      if (!listing) listingNotFound();

      const review = buildListingReview(listing);
      if (review.contactFlags.length > 0) {
        throw new BadRequestException({
          statusCode: 400,
          code: 'LISTING_HAS_CONTACT_INFO',
          message: 'Remove contact information from the listing before publishing',
          details: review.contactFlags,
        });
      }

      const outcome = runModeration(() => transitionPublish(listing, 'admin'));
      const updated = await this.listings.moderate(tx, listingId, outcome);
      await writeModerationAudit(tx, ctx, {
        action: 'listing.published',
        entityType: 'listing',
        entityId: listing.id,
        fromStatus: listing.status,
        toStatus: outcome.status,
      });
      await this.outbox.emit(tx, {
        tenantId: ctx.tenantId,
        eventType: 'listing.published',
        payload: { listingId },
      });
      return updated;
    });
  }
}
