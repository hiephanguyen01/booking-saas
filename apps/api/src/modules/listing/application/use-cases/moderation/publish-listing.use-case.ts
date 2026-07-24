import { Inject, Injectable } from '@nestjs/common';
import { TenantDbService } from '../../../../../shared/tenant-context/tenant-db.service';
import { OutboxService } from '../../../../../shared/outbox/outbox.service';
import { AUDIT_WRITER, type IAuditWriter } from '../../../../../shared/audit/audit-writer.port';
import {
  LISTING_REPOSITORY,
  type IListingRepository,
  type ListingRecord,
} from '../../../domain/ports/listing-repository.port';
import { Listing } from '../../../domain/entities/listing.entity';
import { buildListingReview } from '../../moderation/build-listing-review';
import {
  listingNotFound,
  stampModerationTimestamps,
  writeModerationAudit,
  type ModerationContext,
} from '../../moderation/moderation-support';
import { ListingHasContactInfo } from '../../../domain/errors/listing-errors';

/**
 * A tenant reviewer publishes a listing (pending_review → published, actor
 * `admin`). Publishing is BLOCKED when the listing still leaks contact info
 * (§7.3) — the reviewer must have the partner remove it first — UNLESS the
 * reviewer explicitly passes `force` to override the gate (recorded in the audit).
 */
@Injectable()
export class PublishListingUseCase {
  constructor(
    @Inject(LISTING_REPOSITORY) private readonly listings: IListingRepository,
    private readonly tenantDb: TenantDbService,
    private readonly outbox: OutboxService,
    @Inject(AUDIT_WRITER) private readonly audit: IAuditWriter,
  ) {}

  async execute(ctx: ModerationContext, listingId: string, force = false): Promise<ListingRecord> {
    return this.tenantDb.forTenant(ctx.tenantId, async (tx) => {
      const existing = await this.listings.findById(tx, listingId);
      if (!existing) listingNotFound();
      const listing = Listing.rehydrate(existing);
      listing.assertNotGroupManaged('publish');

      const review = buildListingReview(existing);
      const overrode = review.contactFlags.length > 0 || !review.checklistPassed;
      if (!force && review.contactFlags.length > 0) {
        throw new ListingHasContactInfo('listing', review.contactFlags);
      }

      const outcome = listing.publish('admin');
      const updated = await this.listings.moderate(
        tx,
        listingId,
        stampModerationTimestamps(existing, outcome),
      );
      await writeModerationAudit(this.audit, tx, ctx, {
        action: 'listing.published',
        entityType: 'listing',
        entityId: existing.id,
        fromStatus: existing.status,
        toStatus: outcome.status,
        reason: force && overrode ? 'force-published: review gate bypassed' : undefined,
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
