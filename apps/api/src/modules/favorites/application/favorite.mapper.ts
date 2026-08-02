import type {
  CustomerFavoriteListResponse,
  FavoriteEntryResponse,
  FavoriteListResponse,
  FavoriteSummaryResponse,
  PublicListingResponse,
} from '@booking/contracts';
import type {
  CustomerFavoritePage,
  FavoriteCardRecord,
  FavoriteEntryRecord,
  FavoriteListPage,
  FavoriteSummaryRecord,
} from '../domain/ports/favorite-reader.port';

export function toFavoriteCard(record: FavoriteCardRecord): PublicListingResponse {
  return {
    id: record.id,
    kind: record.kind,
    title: record.title,
    slug: record.slug,
    listingTypeSlug: record.listingTypeSlug,
    attributes: record.attributes,
    photos: record.photos,
    priceFrom: record.priceFrom,
    itemLabel: record.itemLabel,
    ratingAvg: record.ratingAvg,
    reviewCount: record.reviewCount,
    provinceCode: record.provinceCode,
    provinceName: record.provinceName,
    wardCode: record.wardCode,
    wardName: record.wardName,
    address: record.address,
  };
}

export function toCustomerFavoriteListResponse(
  page: CustomerFavoritePage,
  query: { page: number; pageSize: number },
): CustomerFavoriteListResponse {
  return {
    items: page.items.map(toFavoriteCard),
    page: query.page,
    pageSize: query.pageSize,
    total: page.total,
  };
}

function toFavoriteEntry(record: FavoriteEntryRecord): FavoriteEntryResponse {
  return {
    id: record.id,
    customerName: record.customerName,
    customerAvatarUrl: null,
    target: record.target,
    targetId: record.targetId,
    targetTitle: record.targetTitle,
    targetSlug: record.targetSlug,
    createdAt: record.createdAt.toISOString(),
  };
}

export function toFavoriteListResponse(
  page: FavoriteListPage,
  query: { page: number; pageSize: number },
): FavoriteListResponse {
  return {
    items: page.items.map(toFavoriteEntry),
    page: query.page,
    pageSize: query.pageSize,
    total: page.total,
    counts: page.counts,
  };
}

export function toFavoriteSummaryResponse(record: FavoriteSummaryRecord): FavoriteSummaryResponse {
  return {
    total: record.total,
    uniqueCustomers: record.uniqueCustomers,
    topTargets: record.topTargets,
  };
}
