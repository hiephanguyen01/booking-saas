import { Inject, Injectable } from '@nestjs/common';
import type { RepoPage } from '../../../../shared/pagination/pagination';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  LISTING_FEED_REPOSITORY,
  type IListingFeedRepository,
  type ListingFeedFilter,
} from '../../domain/ports/listing-feed-repository.port';
import {
  LISTING_GROUP_REPOSITORY,
  type IListingGroupRepository,
  type ListingGroupRecord,
} from '../../domain/ports/listing-group-repository.port';
import {
  LISTING_REPOSITORY,
  type IListingRepository,
  type ListingRecord,
} from '../../domain/ports/listing-repository.port';

export type PartnerListingFeedItem =
  | { kind: 'single'; item: ListingRecord }
  | { kind: 'grouped'; item: ListingGroupRecord };

/**
 * Partner management feed: the key query establishes the global union order,
 * then normal repositories bulk-load and map the exact records in one RLS tx.
 */
@Injectable()
export class ListPartnerListingFeedUseCase {
  constructor(
    @Inject(LISTING_FEED_REPOSITORY) private readonly feed: IListingFeedRepository,
    @Inject(LISTING_REPOSITORY) private readonly listings: IListingRepository,
    @Inject(LISTING_GROUP_REPOSITORY) private readonly groups: IListingGroupRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  execute(
    tenantId: string,
    filter: ListingFeedFilter,
    page: { page: number; pageSize: number },
  ): Promise<RepoPage<PartnerListingFeedItem>> {
    return this.tenantDb.forTenant(tenantId, async (tx) => {
      const keyed = await this.feed.listPage(tx, filter, page);
      const listingIds = keyed.keys.filter((key) => key.kind === 'single').map((key) => key.id);
      const groupIds = keyed.keys.filter((key) => key.kind === 'grouped').map((key) => key.id);
      const [listings, groups] = await Promise.all([
        this.listings.findByIds(tx, listingIds),
        this.groups.findByIds(tx, groupIds),
      ]);
      const listingsById = new Map(listings.map((listing) => [listing.id, listing]));
      const groupsById = new Map(groups.map((group) => [group.id, group]));

      return {
        total: keyed.total,
        items: keyed.keys.flatMap((key): PartnerListingFeedItem[] => {
          if (key.kind === 'single') {
            const listing = listingsById.get(key.id);
            return listing ? [{ kind: 'single', item: listing }] : [];
          }
          const group = groupsById.get(key.id);
          return group ? [{ kind: 'grouped', item: group }] : [];
        }),
      };
    });
  }
}
