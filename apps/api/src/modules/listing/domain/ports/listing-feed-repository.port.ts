import type { PublishStatus } from '@booking/contracts';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';

export const LISTING_FEED_REPOSITORY = Symbol('LISTING_FEED_REPOSITORY');

/** Filters shared by standalone listings and listing groups in the partner feed. */
export interface ListingFeedFilter {
  partnerId: string;
  listingTypeId?: string;
  status?: PublishStatus;
  q?: string;
}

/** A lightweight ordered key returned before the full records are bulk-loaded. */
export type ListingFeedKey =
  | { kind: 'single'; id: string }
  | { kind: 'grouped'; id: string };

export interface ListingFeedPage {
  keys: ListingFeedKey[];
  total: number;
}

export interface IListingFeedRepository {
  listPage(
    tx: PrismaTx,
    filter: ListingFeedFilter,
    page: { page: number; pageSize: number },
  ): Promise<ListingFeedPage>;
}
