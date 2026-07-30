import { Inject, Injectable } from '@nestjs/common';
import type { ListingRevisionResponse } from '@booking/contracts';
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
import {
  toListingGroupRevisionResponse,
  toListingRevisionResponse,
} from '../../listing-revision.mapper';

/**
 * Every edit waiting in the tenant's queue, oldest first — and, when scoped to a
 * partner, only that partner's. Drives the "changes" tab of the moderation queue
 * and the "waiting for review" chip in the partner's own listing table, so both
 * sides read one list instead of probing each row.
 *
 * A revision whose target vanished (deleted listing) is dropped rather than
 * surfaced as a ghost row.
 */
@Injectable()
export class ListPendingRevisionsUseCase {
  constructor(
    @Inject(LISTING_REVISION_REPOSITORY)
    private readonly revisions: IListingRevisionRepository,
    @Inject(LISTING_REPOSITORY) private readonly listings: IListingRepository,
    @Inject(LISTING_GROUP_REPOSITORY) private readonly groups: IListingGroupRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(
    tenantId: string,
    opts: { partnerId?: string } = {},
  ): Promise<ListingRevisionResponse[]> {
    return this.tenantDb.forTenant(tenantId, async (tx) => {
      const pending = await this.revisions.listPending(tx);
      if (pending.length === 0) return [];

      const listingIds = pending.filter((r) => r.targetType === 'listing').map((r) => r.targetId);
      const groupIds = pending
        .filter((r) => r.targetType === 'listing_group')
        .map((r) => r.targetId);
      const [listings, groups] = await Promise.all([
        this.listings.findByIds(tx, listingIds),
        this.groups.findByIds(tx, groupIds),
      ]);
      const listingById = new Map(listings.map((l) => [l.id, l]));
      const groupById = new Map(groups.map((g) => [g.id, g]));

      return pending.flatMap((revision) => {
        if (revision.targetType === 'listing') {
          const listing = listingById.get(revision.targetId);
          if (!listing) return [];
          if (opts.partnerId && listing.partnerId !== opts.partnerId) return [];
          return [toListingRevisionResponse(revision, listing)];
        }
        const group = groupById.get(revision.targetId);
        if (!group) return [];
        if (opts.partnerId && group.partnerId !== opts.partnerId) return [];
        return [toListingGroupRevisionResponse(revision, group)];
      });
    });
  }
}
