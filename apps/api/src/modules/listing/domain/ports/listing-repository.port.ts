import type { BalanceDue, BookingMode, ModerationActor, PublishStatus } from '@booking/shared';
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
  publishedBy: ModerationActor | null;
  hiddenBy: ModerationActor | null;
  createdAt: Date;
  updatedAt: Date;
}

/** A published listing joined with the context a public quote/detail + trust signals need. */
export interface PublicListingRecord extends ListingRecord {
  resourceTimezone: string;
  listingTypeSlug: string;
  partnerName: string;
  partnerVerifiedAt: Date | null;
  partnerActiveSince: Date;
  completedBookings: number;
  /** Avg seconds from booking creation to approval (§16.1); null when none. */
  avgApprovalResponseSeconds: number | null;
}

/** The fields a moderation transition persists (§7.3). */
export interface ModerationUpdate {
  status: PublishStatus;
  publishedBy: ModerationActor | null;
  hiddenBy: ModerationActor | null;
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
  list(tx: PrismaTx, filter: { groupId?: string; partnerId?: string }): Promise<ListingRecord[]>;
  update(tx: PrismaTx, id: string, data: UpdateListingData): Promise<ListingRecord>;
  moderate(tx: PrismaTx, id: string, update: ModerationUpdate): Promise<ListingRecord>;
  delete(tx: PrismaTx, id: string): Promise<void>;
  countBookings(tx: PrismaTx, listingId: string): Promise<number>;
}
