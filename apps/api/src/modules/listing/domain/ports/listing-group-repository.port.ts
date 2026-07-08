import type { PublishStatus } from '@booking/shared';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';

export const LISTING_GROUP_REPOSITORY = Symbol('LISTING_GROUP_REPOSITORY');

export interface ListingGroupRecord {
  id: string;
  tenantId: string;
  partnerId: string;
  listingTypeId: string;
  title: string;
  slug: string;
  description: string | null;
  address: string | null;
  workingArea: string | null;
  amenities: string[];
  photos: string[];
  status: PublishStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateListingGroupData {
  partnerId: string;
  listingTypeId: string;
  title: string;
  slug: string;
  description?: string | null;
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
  list(tx: PrismaTx): Promise<ListingGroupRecord[]>;
  update(tx: PrismaTx, id: string, data: UpdateListingGroupData): Promise<ListingGroupRecord>;
  delete(tx: PrismaTx, id: string): Promise<void>;
  countListings(tx: PrismaTx, groupId: string): Promise<number>;
}
