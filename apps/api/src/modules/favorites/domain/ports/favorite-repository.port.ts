import type {
  FavoriteTarget,
  PartnerFavoritesQuery,
  TenantFavoritesQuery,
} from '@booking/contracts';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';

export const FAVORITE_REPOSITORY = Symbol('FAVORITE_REPOSITORY');

/** A favorited target shaped for a storefront listing card (mirrors PublicListingResponse). */
export interface FavoriteCardRecord {
  id: string;
  kind: 'listing' | 'group';
  title: string;
  slug: string;
  listingTypeSlug: string;
  attributes: Record<string, unknown>;
  photos: unknown[];
  priceFrom: string | null;
  itemLabel: string | null;
  ratingAvg: number | null;
  reviewCount: number;
  provinceCode: string | null;
  provinceName: string | null;
  wardCode: string | null;
  wardName: string | null;
  address: string | null;
}

export interface CustomerFavoritePage {
  items: FavoriteCardRecord[];
  total: number;
}

/** One "who favorited" row for the partner/tenant dashboard. */
export interface FavoriteEntryRecord {
  id: string;
  customerName: string;
  target: 'listing' | 'group';
  targetId: string;
  targetTitle: string;
  targetSlug: string;
  createdAt: Date;
}

export interface FavoriteListPage {
  items: FavoriteEntryRecord[];
  total: number;
  counts: { all: number; listing: number; group: number };
}

export interface FavoriteSummaryTargetRecord {
  target: 'listing' | 'group';
  targetId: string;
  title: string;
  slug: string;
  count: number;
}

export interface FavoriteSummaryRecord {
  total: number;
  uniqueCustomers: number;
  topTargets: FavoriteSummaryTargetRecord[];
}

export interface IFavoriteRepository {
  /** Resolve the target's owning partner, or null when the target does not exist. */
  resolveTargetPartnerId(tx: PrismaTx, target: FavoriteTarget): Promise<string | null>;
  /** Idempotent add — a duplicate heart is a no-op. */
  add(
    tx: PrismaTx,
    tenantId: string,
    customerId: string,
    partnerId: string,
    target: FavoriteTarget,
  ): Promise<void>;
  /** Idempotent remove — removing a missing heart is a no-op. */
  remove(tx: PrismaTx, customerId: string, target: FavoriteTarget): Promise<void>;
  isFavorited(tx: PrismaTx, customerId: string, target: FavoriteTarget): Promise<boolean>;
  listRefs(
    tx: PrismaTx,
    customerId: string,
  ): Promise<{ listingIds: string[]; groupIds: string[] }>;
  listCustomer(
    tx: PrismaTx,
    customerId: string,
    query: { page: number; pageSize: number },
  ): Promise<CustomerFavoritePage>;
  listDashboard(
    tx: PrismaTx,
    query: PartnerFavoritesQuery | TenantFavoritesQuery,
    partnerId?: string,
  ): Promise<FavoriteListPage>;
  summary(tx: PrismaTx, partnerId?: string): Promise<FavoriteSummaryRecord>;
}
