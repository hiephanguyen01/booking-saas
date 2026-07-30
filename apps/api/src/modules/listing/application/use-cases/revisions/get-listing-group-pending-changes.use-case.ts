import { Inject, Injectable } from '@nestjs/common';
import type { ListingGroupPendingChangesResponse } from '@booking/contracts';
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
import { ListingGroup } from '../../../domain/entities/listing-group.entity';
import { ListingGroupNotFound } from '../../../domain/errors/listing-group-errors';
import {
  toListingGroupRevisionResponse,
  toListingRevisionResponse,
} from '../../listing-revision.mapper';

/**
 * Everything waiting on a post, read as one unit — posts are moderated at the
 * post level (§7.3), so the reviewer sees the group's own edit together with any
 * edited item and approves them together.
 */
@Injectable()
export class GetListingGroupPendingChangesUseCase {
  constructor(
    @Inject(LISTING_GROUP_REPOSITORY) private readonly groups: IListingGroupRepository,
    @Inject(LISTING_REPOSITORY) private readonly listings: IListingRepository,
    @Inject(LISTING_REVISION_REPOSITORY)
    private readonly revisions: IListingRevisionRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(
    tenantId: string,
    groupId: string,
    opts: { requirePartnerId?: string } = {},
  ): Promise<ListingGroupPendingChangesResponse> {
    return this.tenantDb.forTenant(tenantId, async (tx) => {
      const group = await this.groups.findById(tx, groupId);
      if (!group) throw new ListingGroupNotFound();
      ListingGroup.rehydrate(group).assertOwnedForManage(opts.requirePartnerId);

      const children = await this.listings.list(tx, {
        groupId,
        partnerId: group.partnerId,
      });
      const [groupRevision, childRevisions] = await Promise.all([
        this.revisions.findPending(tx, 'listing_group', groupId),
        this.revisions.findPendingForTargets(
          tx,
          'listing',
          children.map((child) => child.id),
        ),
      ]);
      const byId = new Map(children.map((child) => [child.id, child]));

      return {
        groupId,
        group: groupRevision ? toListingGroupRevisionResponse(groupRevision, group) : null,
        listings: childRevisions.flatMap((revision) => {
          const child = byId.get(revision.targetId);
          return child ? [toListingRevisionResponse(revision, child)] : [];
        }),
      };
    });
  }
}
