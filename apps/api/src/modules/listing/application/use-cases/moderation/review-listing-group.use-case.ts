import { Inject, Injectable } from '@nestjs/common';
import type { ListingGroupReviewResponse } from '@booking/contracts';
import { TenantDbService } from '../../../../../shared/tenant-context/tenant-db.service';
import {
  LISTING_GROUP_REPOSITORY,
  type IListingGroupRepository,
} from '../../../domain/ports/listing-group-repository.port';
import {
  LISTING_REPOSITORY,
  type IListingRepository,
} from '../../../domain/ports/listing-repository.port';
import { buildListingGroupReview } from '../../moderation/build-listing-group-review';
import { groupNotFound } from '../../moderation/moderation-support';

/**
 * Read model a tenant reviewer sees for a post: the submission checklist plus
 * contact-info flags for the post AND every item it would publish (§7.3). The
 * group-level mirror of `ReviewListingUseCase`.
 */
@Injectable()
export class ReviewListingGroupUseCase {
  constructor(
    @Inject(LISTING_GROUP_REPOSITORY) private readonly groups: IListingGroupRepository,
    @Inject(LISTING_REPOSITORY) private readonly listings: IListingRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(tenantId: string, groupId: string): Promise<ListingGroupReviewResponse> {
    return this.tenantDb.forTenant(tenantId, async (tx) => {
      const group = await this.groups.findById(tx, groupId);
      if (!group) groupNotFound();
      const children = await this.listings.list(tx, {
        groupId: group.id,
        partnerId: group.partnerId,
      });
      return buildListingGroupReview(group, children);
    });
  }
}
