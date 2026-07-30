import { Inject, Injectable } from '@nestjs/common';
import type { UpdateListingGroupInput } from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import {
  LISTING_GROUP_REPOSITORY,
  type IListingGroupRepository,
  type ListingGroupRecord,
} from '../../domain/ports/listing-group-repository.port';
import {
  LISTING_REVISION_REPOSITORY,
  type IListingRevisionRepository,
} from '../../domain/ports/listing-revision-repository.port';
import { ListingGroup } from '../../domain/entities/listing-group.entity';
import { ListingGroupNotFound } from '../../domain/errors/listing-group-errors';
import { ApplyListingGroupUpdateUseCase } from './apply-listing-group-update.use-case';

export interface SaveListingGroupEditResult {
  group: ListingGroupRecord;
  parkedForReview: boolean;
}

/**
 * A partner saving the post's "thông tin chung" form — the group mirror of
 * {@link SaveListingEditUseCase}. A reviewed post stays live and visible while
 * its edit waits, which is what replaces the old hide-edit-resubmit cycle.
 */
@Injectable()
export class SaveListingGroupEditUseCase {
  constructor(
    @Inject(LISTING_GROUP_REPOSITORY) private readonly groups: IListingGroupRepository,
    @Inject(LISTING_REVISION_REPOSITORY)
    private readonly revisions: IListingRevisionRepository,
    private readonly applyUpdate: ApplyListingGroupUpdateUseCase,
    private readonly tenantDb: TenantDbService,
    private readonly outbox: OutboxService,
  ) {}

  async execute(
    tenantId: string,
    id: string,
    input: UpdateListingGroupInput,
    ctx: { partnerId?: string; actorUserId: string | null },
  ): Promise<SaveListingGroupEditResult> {
    return this.tenantDb.forTenant(tenantId, async (tx) => {
      const existing = await this.groups.findById(tx, id);
      if (!existing) throw new ListingGroupNotFound();
      ListingGroup.rehydrate(existing).assertOwnedForManage(ctx.partnerId);

      if (existing.status === 'draft') {
        const group = await this.applyUpdate.execute(tx, tenantId, id, input, {
          requirePartnerId: ctx.partnerId,
        });
        return { group, parkedForReview: false };
      }
      // An empty patch changes nothing; see SaveListingEditUseCase.
      if (Object.keys(input).length === 0) {
        return { group: existing, parkedForReview: false };
      }

      const revision = await this.revisions.upsertPending(tx, tenantId, {
        targetType: 'listing_group',
        targetId: id,
        payload: input as Record<string, unknown>,
        submittedByUserId: ctx.actorUserId,
      });
      await this.outbox.emit(tx, {
        tenantId,
        eventType: 'listing_group.revision_submitted',
        payload: { listingGroupId: id, revisionId: revision.id },
      });
      return { group: existing, parkedForReview: true };
    });
  }
}
