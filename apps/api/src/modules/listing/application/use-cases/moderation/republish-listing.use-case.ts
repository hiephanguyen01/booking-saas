import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type { ModerationActor } from '@booking/contracts';
import { TenantDbService } from '../../../../../shared/tenant-context/tenant-db.service';
import { OutboxService } from '../../../../../shared/outbox/outbox.service';
import { AUDIT_WRITER, type IAuditWriter } from '../../../../../shared/audit/audit-writer.port';
import {
  LISTING_REPOSITORY,
  type IListingRepository,
  type ListingRecord,
} from '../../../domain/ports/listing-repository.port';
import { transitionRepublish } from '../../../domain/moderation/listing-moderation';
import {
  assertOwnership,
  listingNotFound,
  runModeration,
  writeModerationAudit,
  type ModerationContext,
} from '../../moderation/moderation-support';

/**
 * Re-publish an archived post (→ published). Enforces the lockout: a partner
 * cannot re-publish a post an admin hid — that raises 403 LISTING_ADMIN_LOCKED
 * (§7.3). An admin can always unlock.
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
      const listing = await this.listings.findById(tx, listingId);
      if (!listing) listingNotFound();
      assertOwnership(listing, ctx.partnerId);
      if (listing.groupId) {
        throw new BadRequestException({
          statusCode: 400,
          code: 'GROUP_MANAGED_LISTING',
          message: 'Republish the parent listing group instead',
        });
      }

      const outcome = runModeration(() => transitionRepublish(listing, actor));
      const updated = await this.listings.moderate(tx, listingId, outcome);
      await writeModerationAudit(this.audit, tx, ctx, {
        action: 'listing.republished',
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
