import type { BookingMode, ModerationActor, PublishStatus } from '@booking/contracts';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import type { ModerationUpdate } from './listing-repository.port';

export const LISTING_GROUP_REPOSITORY = Symbol('LISTING_GROUP_REPOSITORY');

/**
 * The slice of a child listing a post's aggregates are derived from. Joined by
 * every group query so `listingCount` / `readyListingCount` / `priceFrom` come
 * back with the group instead of costing an N+1 per row.
 */
export interface ListingGroupChildFacts {
  description: string | null;
  photos: string[];
  bookingModes: BookingMode[];
  modeConfig: Record<string, unknown>;
}

export interface ListingGroupRecord {
  id: string;
  tenantId: string;
  partnerId: string;
  listingTypeId: string;
  title: string;
  slug: string;
  description: string | null;
  provinceCode: string | null;
  provinceName: string | null;
  wardCode: string | null;
  wardName: string | null;
  address: string | null;
  workingArea: string | null;
  amenities: string[];
  photos: string[];
  status: PublishStatus;
  publishedBy: ModerationActor | null;
  hiddenBy: ModerationActor | null;
  /** Mean review score (1–5, 2dp) as a number; null until the post has ratings. */
  ratingAvg: number | null;
  bookingCount: number;
  /** The post's items, reduced to what the readiness/price aggregates need. */
  children: ListingGroupChildFacts[];
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateListingGroupData {
  partnerId: string;
  listingTypeId: string;
  title: string;
  slug: string;
  description?: string | null;
  provinceCode?: string | null;
  provinceName?: string | null;
  wardCode?: string | null;
  wardName?: string | null;
  address?: string | null;
  workingArea?: string | null;
  amenities: string[];
  photos: string[];
}

export type UpdateListingGroupData = Partial<CreateListingGroupData>;

export interface IListingGroupRepository {
  create(tx: PrismaTx, tenantId: string, data: CreateListingGroupData): Promise<ListingGroupRecord>;
  findById(tx: PrismaTx, id: string): Promise<ListingGroupRecord | null>;
  findBySlug(tx: PrismaTx, slug: string): Promise<ListingGroupRecord | null>;
  list(tx: PrismaTx, filter?: { partnerId?: string }): Promise<ListingGroupRecord[]>;
  update(tx: PrismaTx, id: string, data: UpdateListingGroupData): Promise<ListingGroupRecord>;
  moderate(tx: PrismaTx, id: string, update: ModerationUpdate): Promise<ListingGroupRecord>;
  delete(tx: PrismaTx, id: string): Promise<void>;
  countListings(tx: PrismaTx, groupId: string): Promise<number>;
}
