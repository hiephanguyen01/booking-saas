import { Inject, Injectable } from '@nestjs/common';
import type { ListingReviewResponse } from '@booking/contracts';
import { TenantDbService } from '../../../../../shared/tenant-context/tenant-db.service';
import { OutboxService } from '../../../../../shared/outbox/outbox.service';
import { AUDIT_WRITER, type IAuditWriter } from '../../../../../shared/audit/audit-writer.port';
import {
  LISTING_REPOSITORY,
  type IListingRepository,
  type ListingRecord,
} from '../../../domain/ports/listing-repository.port';
import { transitionSubmit } from '../../../domain/moderation/listing-moderation';
import { buildListingReview } from '../../moderation/build-listing-review';
import {
  assertOwnership,
  listingNotFound,
  runModeration,
  writeModerationAudit,
  type ModerationContext,
} from '../../moderation/moderation-support';

/**
 * A partner submits a draft for tenant review (draft → pending_review). Returns
 * the review (checklist + contact-info flags) so the partner sees what the
 * reviewer will. Admin-hidden posts cannot be resubmitted (domain rule).
 */
@Injectable()
export class SubmitListingUseCase {
  constructor(
    @Inject(LISTING_REPOSITORY) private readonly listings: IListingRepository,
    private readonly tenantDb: TenantDbService,
    private readonly outbox: OutboxService,
    @Inject(AUDIT_WRITER) private readonly audit: IAuditWriter,
  ) {}

  async execute(
    ctx: ModerationContext,
    listingId: string,
  ): Promise<{ listing: ListingRecord; review: ListingReviewResponse }> {
    return this.tenantDb.forTenant(ctx.tenantId, async (tx) => {
      const listing = await this.listings.findById(tx, listingId);
      if (!listing) listingNotFound();
      assertOwnership(listing, ctx.partnerId);

      const outcome = runModeration(() => transitionSubmit(listing));
      const updated = await this.listings.moderate(tx, listingId, outcome);
      await writeModerationAudit(this.audit, tx, ctx, {
        action: 'listing.submitted',
        entityType: 'listing',
        entityId: listing.id,
        fromStatus: listing.status,
        toStatus: outcome.status,
      });
      await this.outbox.emit(tx, {
        tenantId: ctx.tenantId,
        eventType: 'listing.submitted',
        payload: { listingId },
      });
      return { listing: updated, review: buildListingReview(updated) };
    });
  }
}
