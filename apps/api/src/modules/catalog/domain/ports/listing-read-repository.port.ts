import type { BookingMode } from '@booking/contracts';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';

export const LISTING_READ_REPOSITORY = Symbol('LISTING_READ_REPOSITORY');

export interface PublicListingRecord {
  id: string;
  title: string;
  slug: string;
  listingTypeSlug: string;
  attributes: Record<string, unknown>;
  photos: unknown[];
  modeConfig: Record<string, unknown>;
  bookingModes: BookingMode[];
  capacity: number | null;
  stockQuantity: number | null;
  bufferBefore: number;
  bufferAfter: number;
  depositPercent: number;
  resourceId: string;
  resourceTimezone: string;
  provinceCode: string | null;
  provinceName: string | null;
  wardCode: string | null;
  wardName: string | null;
  address: string | null;
  publishedAt: Date | null;
  completedBookings: number;
  ratingAvg: number | null;
  reviewCount: number;
  availabilityRules: Array<{ dayOfWeek: number; openTime: string; closeTime: string }>;
  pricingRules: Array<{
    id: string;
    bookingMode: BookingMode;
    ruleType: 'day_of_week' | 'time_range' | 'date_range' | 'date_time_range';
    params: Record<string, unknown>;
    price: string;
    salePrice: string | null;
    priority: number;
  }>;
  availabilityExceptions: Array<{
    date: string;
    type: 'closed' | 'custom_hours';
    openTime: string | null;
    closeTime: string | null;
  }>;
  group: {
    id: string;
    title: string;
    slug: string;
    photos: unknown[];
    amenities: unknown[];
    itemLabel: string | null;
    provinceCode: string | null;
    provinceName: string | null;
    wardCode: string | null;
    wardName: string | null;
    address: string | null;
    ratingAvg: number | null;
    reviewCount: number;
  } | null;
}

export interface BusyRangeRecord {
  resourceId: string;
  start: Date;
  end: Date;
}

export interface InventoryUsageRecord {
  listingId: string;
  used: number;
}

export interface PublicListingFilter {
  typeSlug?: string;
  category?: string;
  q?: string;
  attrFilters: Record<string, string>;
  exceptionFrom?: Date;
  exceptionTo?: Date;
}

/** Storefront reads. All methods run inside one tenant-scoped transaction. */
export interface IListingReadRepository {
  findPublished(tx: PrismaTx, filter: PublicListingFilter): Promise<PublicListingRecord[]>;
  busyRanges(
    tx: PrismaTx,
    resourceIds: string[],
    fromUtc: Date,
    toUtc: Date,
  ): Promise<BusyRangeRecord[]>;
  inventoryUsage(
    tx: PrismaTx,
    listingIds: string[],
    fromUtc: Date,
    toUtc: Date,
  ): Promise<InventoryUsageRecord[]>;
}
