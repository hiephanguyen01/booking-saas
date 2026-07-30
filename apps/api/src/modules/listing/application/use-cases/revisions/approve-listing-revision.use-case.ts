import { Inject, Injectable } from '@nestjs/common';
import type { UpdateListingGroupInput, UpdateListingInput } from '@booking/contracts';
import { TenantDbService } from '../../../../../shared/tenant-context/tenant-db.service';
import type { PrismaTx } from '../../../../../shared/tenant-context/tenant-db.service';
import { OutboxService } from '../../../../../shared/outbox/outbox.service';
import { AUDIT_WRITER, type IAuditWriter } from '../../../../../shared/audit/audit-writer.port';
import {
  LISTING_REVISION_REPOSITORY,
  type IListingRevisionRepository,
  type ListingRevisionRecord,
} from '../../../domain/ports/listing-revision-repository.port';
import {
  LISTING_REPOSITORY,
  type IListingRepository,
  type ListingRecord,
} from '../../../domain/ports/listing-repository.port';
import {
  ListingRevisionAlreadyDecided,
  ListingRevisionNotFound,
} from '../../../domain/errors/listing-revision-errors';
import { ListingHasContactInfo } from '../../../domain/errors/listing-errors';
import {
  LISTING_REVIEWED_FIELDS,
  mergeRevisionPayload,
} from '../../../domain/revisions/revision-diff';
import { buildListingReview } from '../../moderation/build-listing-review';
import type { ModerationContext } from '../../moderation/moderation-support';
import { ApplyListingGroupUpdateUseCase } from '../apply-listing-group-update.use-case';
import { ApplyListingUpdateUseCase } from '../apply-listing-update.use-case';

/**
 * A tenant reviewer accepts a parked edit: the payload is written onto the live
 * record **through the ordinary update path**, so every validation a partner's
 * edit would have faced (attribute schema, mode config and packages, deposit
 * coverage, slug collisions) runs now, against today's listing type.
 *
 * Applying the content and settling the revision share one transaction — a
 * half-applied approval would leave the partner staring at a change that is live
 * but still "waiting".
 *
 * A post is reviewed as a unit (§7.3): approving a post applies its own edit plus
 * every waiting item edit in the same transaction.
 */
@Injectable()
export class ApproveListingRevisionUseCase {
  constructor(
    @Inject(LISTING_REVISION_REPOSITORY)
    private readonly revisions: IListingRevisionRepository,
    @Inject(LISTING_REPOSITORY) private readonly listings: IListingRepository,
    private readonly applyListingUpdate: ApplyListingUpdateUseCase,
    private readonly applyGroupUpdate: ApplyListingGroupUpdateUseCase,
    private readonly tenantDb: TenantDbService,
    private readonly outbox: OutboxService,
    @Inject(AUDIT_WRITER) private readonly audit: IAuditWriter,
  ) {}

  /** Approve the single edit waiting on a standalone listing. */
  async execute(ctx: ModerationContext, listingId: string, force = false): Promise<void> {
    await this.tenantDb.forTenant(ctx.tenantId, async (tx) => {
      const pending = await this.revisions.findPending(tx, 'listing', listingId);
      if (!pending) throw new ListingRevisionNotFound();
      await this.applyOne(tx, ctx, pending, force);
    });
  }

  /** Approve everything waiting on a post: the group's edit and its items'. */
  async executeForGroup(
    ctx: ModerationContext,
    groupId: string,
    itemIds: string[],
    force = false,
  ): Promise<void> {
    await this.tenantDb.forTenant(ctx.tenantId, async (tx) => {
      const groupRevision = await this.revisions.findPending(tx, 'listing_group', groupId);
      const itemRevisions = await this.revisions.findPendingForTargets(tx, 'listing', itemIds);
      if (!groupRevision && itemRevisions.length === 0) throw new ListingRevisionNotFound();
      if (groupRevision) await this.applyOne(tx, ctx, groupRevision, force);
      for (const revision of itemRevisions) {
        await this.applyOne(tx, ctx, revision, force);
      }
    });
  }

  private async applyOne(
    tx: PrismaTx,
    ctx: ModerationContext,
    revision: ListingRevisionRecord,
    force: boolean,
  ): Promise<void> {
    if (revision.targetType === 'listing') {
      // The gate that made the first publication safe applies to every later edit
      // too — otherwise contact info could be slipped in after approval. `force`
      // is the reviewer's deliberate override, mirroring publish.
      const listing = await this.listings.findById(tx, revision.targetId);
      if (listing && !force) {
        const review = buildListingReview(
          mergeRevisionPayload<ListingRecord>(listing, revision.payload, LISTING_REVIEWED_FIELDS),
        );
        if (review.contactFlags.length > 0) {
          throw new ListingHasContactInfo('listing', review.contactFlags);
        }
      }
      await this.applyListingUpdate.execute(
        tx,
        ctx.tenantId,
        revision.targetId,
        revision.payload as UpdateListingInput,
      );
    } else {
      await this.applyGroupUpdate.execute(
        tx,
        ctx.tenantId,
        revision.targetId,
        revision.payload as UpdateListingGroupInput,
      );
    }

    const decided = await this.revisions.decide(tx, revision.id, 'pending', {
      status: 'approved',
      reviewedByUserId: ctx.actorUserId ?? null,
      reviewNote: null,
      appliedAt: new Date(),
    });
    if (!decided) throw new ListingRevisionAlreadyDecided();

    await this.audit.write(tx, {
      tenantId: ctx.tenantId,
      actorUserId: ctx.actorUserId ?? null,
      action: 'listing.revision_approved',
      entityType: revision.targetType === 'listing' ? 'listing' : 'listing_group',
      entityId: revision.targetId,
      ip: ctx.ip ?? null,
      data: { revisionId: revision.id, fields: Object.keys(revision.payload) },
    });
    // The listing flavour carries `listingId` because the notification module's
    // listing dispatcher resolves the partner's recipients from it; the post
    // flavour has no template yet and routes to nobody.
    await this.outbox.emit(
      tx,
      revision.targetType === 'listing'
        ? {
            tenantId: ctx.tenantId,
            eventType: 'listing.revision_approved',
            payload: { listingId: revision.targetId, revisionId: revision.id },
          }
        : {
            tenantId: ctx.tenantId,
            eventType: 'listing_group.revision_approved',
            payload: { listingGroupId: revision.targetId, revisionId: revision.id },
          },
    );
  }
}
