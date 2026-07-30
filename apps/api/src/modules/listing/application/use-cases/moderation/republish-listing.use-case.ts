import { Inject, Injectable } from '@nestjs/common';
import type { ModerationActor } from '@booking/contracts';
import { TenantDbService } from '../../../../../shared/tenant-context/tenant-db.service';
import { OutboxService } from '../../../../../shared/outbox/outbox.service';
import { AUDIT_WRITER, type IAuditWriter } from '../../../../../shared/audit/audit-writer.port';
import {
  LISTING_REPOSITORY,
  type IListingRepository,
  type ListingRecord,
} from '../../../domain/ports/listing-repository.port';
import { Listing } from '../../../domain/entities/listing.entity';
import {
  listingNotFound,
  stampModerationTimestamps,
  writeModerationAudit,
  type ModerationContext,
} from '../../moderation/moderation-support';
import { ListingStateChanged } from '../../../domain/errors/listing-errors';

/**
 * Re-publish an archived post (→ published). Enforces the lockout: a partner
 * cannot re-publish a post an admin hid — that raises 403 LISTING_ADMIN_LOCKED
 * (§7.3). An admin can always unlock.
 *
 * Un-hiding can no longer smuggle content past review: a partner's edit of an
 * already-reviewed listing is parked as a revision, so the row itself only ever
 * holds approved content, and a listing that was never published comes back as
 * `pending_review` rather than live (see `transitionRepublish`).
 */
@Injectable()
export class RepublishListingUseCase {
  constructor(
    @Inject(LISTING_REPOSITORY) private readonly listings: IListingRepository,
    private readonly tenantDb: TenantDbService,
    private readonly outbox: OutboxService,
    @Inject(AUDIT_WRITER) private readonly audit: IAuditWriter,
  ) {}

  async execute(
    ctx: ModerationContext,
    listingId: string,
    actor: ModerationActor,
  ): Promise<ListingRecord> {
    return this.tenantDb.forTenant(ctx.tenantId, async (tx) => {
      const existing = await this.listings.findById(tx, listingId);
      if (!existing) listingNotFound();
      const listing = Listing.rehydrate(existing);
      listing.assertOwnedForModeration(ctx.partnerId);
      listing.assertNotGroupManaged('republish');

      const outcome = listing.republish(actor);
      // A republish keeps the ORIGINAL publishedAt — stampModerationTimestamps
      // only sets it when the listing has never been published.
      const updated = await this.listings.moderate(
        tx,
        listingId,
        existing.status,
        stampModerationTimestamps(existing, outcome),
      );
      if (!updated) throw new ListingStateChanged();
      await writeModerationAudit(this.audit, tx, ctx, {
        action: 'listing.republished',
        entityType: 'listing',
        entityId: existing.id,
        fromStatus: existing.status,
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
