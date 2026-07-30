import { Inject, Injectable } from '@nestjs/common';
import type { RevisionTarget } from '@booking/contracts';
import { TenantDbService } from '../../../../../shared/tenant-context/tenant-db.service';
import {
  LISTING_GROUP_REPOSITORY,
  type IListingGroupRepository,
} from '../../../domain/ports/listing-group-repository.port';
import {
  LISTING_REPOSITORY,
  type IListingRepository,
} from '../../../domain/ports/listing-repository.port';
import {
  LISTING_REVISION_REPOSITORY,
  type IListingRevisionRepository,
} from '../../../domain/ports/listing-revision-repository.port';
import { Listing } from '../../../domain/entities/listing.entity';
import { ListingGroup } from '../../../domain/entities/listing-group.entity';
import { ListingNotFound } from '../../../domain/errors/listing-errors';
import { ListingGroupNotFound } from '../../../domain/errors/listing-group-errors';
import {
  ListingRevisionAlreadyDecided,
  ListingRevisionNotFound,
} from '../../../domain/errors/listing-revision-errors';

/**
 * The partner drops their waiting edit and goes back to the approved content.
 * Ownership is re-checked against the target, not the revision, so a partner can
 * only discard changes to their own listing.
 */
@Injectable()
export class DiscardListingRevisionUseCase {
  constructor(
    @Inject(LISTING_REVISION_REPOSITORY)
    private readonly revisions: IListingRevisionRepository,
    @Inject(LISTING_REPOSITORY) private readonly listings: IListingRepository,
    @Inject(LISTING_GROUP_REPOSITORY) private readonly groups: IListingGroupRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(
    tenantId: string,
    targetType: RevisionTarget,
    targetId: string,
    ctx: { partnerId?: string; actorUserId: string | null },
  ): Promise<void> {
    await this.tenantDb.forTenant(tenantId, async (tx) => {
      if (targetType === 'listing') {
        const listing = await this.listings.findById(tx, targetId);
        if (!listing) throw new ListingNotFound();
        Listing.rehydrate(listing).assertOwnedForEdit(ctx.partnerId);
      } else {
        const group = await this.groups.findById(tx, targetId);
        if (!group) throw new ListingGroupNotFound();
        ListingGroup.rehydrate(group).assertOwnedForManage(ctx.partnerId);
      }

      const pending = await this.revisions.findPending(tx, targetType, targetId);
      if (!pending) throw new ListingRevisionNotFound();
      const decided = await this.revisions.decide(tx, pending.id, 'pending', {
        status: 'discarded',
        reviewedByUserId: ctx.actorUserId,
        reviewNote: null,
        appliedAt: null,
      });
      if (!decided) throw new ListingRevisionAlreadyDecided();
    });
  }
}
