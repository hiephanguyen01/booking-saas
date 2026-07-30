import type {
  BookingMode,
  BookingSelection,
  ListingGroupAmenity,
  ModerationActor,
  PublishStatus,
} from '@booking/contracts';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import type { RepoPage } from '../../../../shared/pagination/pagination';
import type { ModerationUpdate } from './listing-repository.port';
import type { ListingGroupContentPatch, NewListingGroup } from '../entities/listing-group.entity';

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
  bookingSelection: BookingSelection;
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
  amenities: ListingGroupAmenity[];
  photos: string[];
  status: PublishStatus;
  publishedBy: ModerationActor | null;
  hiddenBy: ModerationActor | null;
  /** Mean review score (1–5, 2dp) as a number; null until the post has ratings. */
  ratingAvg: number | null;
  reviewCount: number;
  bookingCount: number;
  favoriteCount: number;
  partnerPublic: {
    name: string;
    slug: string;
    status: 'pending' | 'approved' | 'suspended';
    verifiedAt: Date | null;
    createdAt: Date;
    logoUrl: string | null;
  };
  /** The post's items, reduced to what the readiness/price aggregates need. */
  children: ListingGroupChildFacts[];
  createdAt: Date;
  updatedAt: Date;
}

export interface IListingGroupRepository {
  create(tx: PrismaTx, tenantId: string, data: NewListingGroup): Promise<ListingGroupRecord>;
  findById(tx: PrismaTx, id: string): Promise<ListingGroupRecord | null>;
  /** Loads records in any database order; callers restore their requested key order. */
  findByIds(tx: PrismaTx, ids: readonly string[]): Promise<ListingGroupRecord[]>;
  findBySlug(tx: PrismaTx, slug: string): Promise<ListingGroupRecord | null>;
  list(
    tx: PrismaTx,
    filter?: { partnerId?: string; listingTypeId?: string; status?: PublishStatus },
  ): Promise<ListingGroupRecord[]>;
  /** One page of `list`, plus the unpaginated total (§13 pagination shape). */
  listPage(
    tx: PrismaTx,
    filter: {
      partnerId?: string;
      listingTypeId?: string;
      status?: PublishStatus;
      q?: string;
    },
    page: { page: number; pageSize: number },
  ): Promise<RepoPage<ListingGroupRecord>>;
  update(
    tx: PrismaTx,
    id: string,
    expectedUpdatedAt: Date,
    data: ListingGroupContentPatch,
  ): Promise<ListingGroupRecord | null>;
  moderate(
    tx: PrismaTx,
    id: string,
    expectedStatus: PublishStatus,
    update: ModerationUpdate,
  ): Promise<ListingGroupRecord | null>;
  delete(tx: PrismaTx, id: string): Promise<void>;
  countListings(tx: PrismaTx, groupId: string): Promise<number>;
}
