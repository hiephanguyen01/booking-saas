import { Inject, Injectable } from '@nestjs/common';
import type { ModerationActor } from '@booking/contracts';
import { TenantDbService } from '../../../../../shared/tenant-context/tenant-db.service';
import { OutboxService } from '../../../../../shared/outbox/outbox.service';
import {
  LISTING_REPOSITORY,
  type IListingRepository,
  type ListingRecord,
} from '../../../domain/ports/listing-repository.port';
import { transitionHide } from '../../../domain/moderation/listing-moderation';
import {
  assertOwnership,
  listingNotFound,
  runModeration,
  writeModerationAudit,
  type ModerationContext,
} from '../../moderation/moderation-support';

/**
 * Hide a post (→ archived), recording who hid it (`published_by`/`hidden_by`,
 * §7.3). An admin hide later locks the partner out of re-publishing.
 */
@Injectable()
export class HideListingUseCase {
  constructor(
    @Inject(LISTING_REPOSITORY) private readonly listings: IListingRepository,
    private readonly tenantDb: TenantDbService,
    private readonly outbox: OutboxService,
  ) {}

  async execute(
    ctx: ModerationContext,
    listingId: string,
    actor: ModerationActor,
    reason?: string,
  ): Promise<ListingRecord> {
    return this.tenantDb.forTenant(ctx.tenantId, async (tx) => {
      const listing = await this.listings.findById(tx, listingId);
      if (!listing) listingNotFound();
      assertOwnership(listing, ctx.partnerId);

      const outcome = runModeration(() => transitionHide(listing, actor));
      const updated = await this.listings.moderate(tx, listingId, outcome);
      await writeModerationAudit(tx, ctx, {
        action: 'listing.hidden',
        entityType: 'listing',
        entityId: listing.id,
        fromStatus: listing.status,
        toStatus: outcome.status,
        reason,
      });
      await this.outbox.emit(tx, {
        tenantId: ctx.tenantId,
        eventType: 'listing.hidden',
        payload: { listingId, hiddenBy: actor },
      });
      return updated;
    });
  }
}
