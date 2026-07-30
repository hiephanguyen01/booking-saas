import { Inject, Injectable } from '@nestjs/common';
import type { RevisionTarget } from '@booking/contracts';
import { TenantDbService } from '../../../../../shared/tenant-context/tenant-db.service';
import { OutboxService } from '../../../../../shared/outbox/outbox.service';
import { AUDIT_WRITER, type IAuditWriter } from '../../../../../shared/audit/audit-writer.port';
import {
  LISTING_REVISION_REPOSITORY,
  type IListingRevisionRepository,
} from '../../../domain/ports/listing-revision-repository.port';
import {
  ListingRevisionAlreadyDecided,
  ListingRevisionNotFound,
} from '../../../domain/errors/listing-revision-errors';
import type { ModerationContext } from '../../moderation/moderation-support';

/**
 * A reviewer turns a parked edit down. The live record is untouched — the listing
 * keeps serving its approved content — and the note travels back to the partner,
 * who still has their edited content in the form and can fix and resubmit it.
 */
@Injectable()
export class RejectListingRevisionUseCase {
  constructor(
    @Inject(LISTING_REVISION_REPOSITORY)
    private readonly revisions: IListingRevisionRepository,
    private readonly tenantDb: TenantDbService,
    private readonly outbox: OutboxService,
    @Inject(AUDIT_WRITER) private readonly audit: IAuditWriter,
  ) {}

  async execute(
    ctx: ModerationContext,
    targetType: RevisionTarget,
    targetId: string,
    note: string,
  ): Promise<void> {
    await this.tenantDb.forTenant(ctx.tenantId, async (tx) => {
      const pending = await this.revisions.findPending(tx, targetType, targetId);
      if (!pending) throw new ListingRevisionNotFound();

      const decided = await this.revisions.decide(tx, pending.id, 'pending', {
        status: 'rejected',
        reviewedByUserId: ctx.actorUserId ?? null,
        reviewNote: note,
        appliedAt: null,
      });
      if (!decided) throw new ListingRevisionAlreadyDecided();

      await this.audit.write(tx, {
        tenantId: ctx.tenantId,
        actorUserId: ctx.actorUserId ?? null,
        action: 'listing.revision_rejected',
        entityType: targetType === 'listing' ? 'listing' : 'listing_group',
        entityId: targetId,
        ip: ctx.ip ?? null,
        data: { revisionId: pending.id, note },
      });
      // `listingId` + `reason` are what the listing notification dispatcher reads,
      // so the partner's email carries the reviewer's note.
      await this.outbox.emit(
        tx,
        targetType === 'listing'
          ? {
              tenantId: ctx.tenantId,
              eventType: 'listing.revision_rejected',
              payload: { listingId: targetId, revisionId: pending.id, reason: note },
            }
          : {
              tenantId: ctx.tenantId,
              eventType: 'listing_group.revision_rejected',
              payload: { listingGroupId: targetId, revisionId: pending.id, reason: note },
            },
      );
    });
  }
}
