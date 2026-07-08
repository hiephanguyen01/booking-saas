import type { BalanceDue, BookingMode, PublishStatus } from '@booking/shared';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';

export const LISTING_REPOSITORY = Symbol('LISTING_REPOSITORY');

export interface ListingRecord {
  id: string;
  tenantId: string;
  partnerId: string;
  listingTypeId: string;
  resourceId: string;
  groupId: string | null;
  categoryId: string | null;
  title: string;
  slug: string;
  description: string | null;
  photos: string[];
  attributes: Record<string, unknown>;
  bookingModes: BookingMode[];
  modeConfig: Record<string, unknown>;
  stockQuantity: number | null;
  capacity: number | null;
  bufferBefore: number;
  bufferAfter: number;
  approvalRequired: boolean;
  depositPercent: number;
  balanceDue: BalanceDue;
  cancellationPolicyId: string | null;
  status: PublishStatus;
  createdAt: Date;
  updatedAt: Date;
}

/** A published listing joined with the context a public quote/detail needs. */
export interface PublicListingRecord extends ListingRecord {
  resourceTimezone: string;
  listingTypeSlug: string;
}

export interface CreateListingData {
  partnerId: string;
  listingTypeId: string;
  resourceId: string;
  groupId?: string | null;
  categoryId?: string | null;
  title: string;
  slug: string;
  description?: string | null;
  photos: string[];
  attributes: Record<string, unknown>;
  bookingModes: BookingMode[];
  modeConfig: Record<string, unknown>;
  stockQuantity?: number | null;
  capacity?: number | null;
  bufferBefore: number;
  bufferAfter: number;
  approvalRequired: boolean;
  depositPercent: number;
  balanceDue: BalanceDue;
  cancellationPolicyId?: string | null;
}

export type UpdateListingData = Partial<
  Omit<CreateListingData, 'partnerId' | 'listingTypeId' | 'resourceId'>
>;

export interface IListingRepository {
  create(tx: PrismaTx, tenantId: string, data: CreateListingData): Promise<ListingRecord>;
  findById(tx: PrismaTx, id: string): Promise<ListingRecord | null>;
  findBySlug(tx: PrismaTx, slug: string): Promise<ListingRecord | null>;
  findPublicBySlug(tx: PrismaTx, slug: string): Promise<PublicListingRecord | null>;
  list(tx: PrismaTx, filter: { groupId?: string }): Promise<ListingRecord[]>;
  update(tx: PrismaTx, id: string, data: UpdateListingData): Promise<ListingRecord>;
  delete(tx: PrismaTx, id: string): Promise<void>;
  countBookings(tx: PrismaTx, listingId: string): Promise<number>;
}
