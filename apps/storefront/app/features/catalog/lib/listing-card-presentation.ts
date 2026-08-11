import type {
  NearbyPublicListing,
  PublicCatalogSearchItem,
  PublicListingResponse,
} from '@booking/contracts';
import type {
  DiscoveryListingCardData,
  ListingCardPresentation,
} from '~/features/catalog/lib/listing-card.types';

/** Integer-safe discount calculation shared by search and discovery cards. */
export function calculateDiscountPercent(
  regularPrice: string | null,
  salePrice: string | null,
): number | null {
  if (!regularPrice || !salePrice) return null;
  const regular = BigInt(regularPrice);
  const sale = BigInt(salePrice);
  if (regular <= 0n || sale >= regular) return null;

  return Number(((regular - sale) * 100n + regular / 2n) / regular);
}

export function publicListingFromCatalogItem(
  item: PublicCatalogSearchItem,
): PublicListingResponse {
  return {
    id: item.id,
    kind: item.kind,
    title: item.title,
    slug: item.slug,
    listingTypeSlug: item.listingTypeSlug,
    attributes: {},
    photos: item.photos,
    priceFrom: item.priceFrom,
    itemLabel: null,
    ratingAvg: item.ratingAvg,
    reviewCount: item.reviewCount,
    provinceCode: item.provinceCode,
    provinceName: item.provinceName,
    wardCode: item.wardCode,
    wardName: item.wardName,
    address: item.address,
  };
}

export function presentationFromCatalogItem(
  item: PublicCatalogSearchItem,
): ListingCardPresentation {
  return {
    originalPrice: item.regularPriceFrom,
    discountPercent: calculateDiscountPercent(item.regularPriceFrom, item.priceFrom),
    priceUnit: item.priceUnit,
    completedBookings: item.completedBookings,
  };
}

export function discoveryListingFromCatalogItem(
  item: PublicCatalogSearchItem,
): DiscoveryListingCardData {
  return {
    listing: publicListingFromCatalogItem(item),
    presentation: presentationFromCatalogItem(item),
  };
}

/**
 * Adapts a plain storefront card projection to the canonical discovery shape.
 * Optional metadata is copied only when a caller actually owns a real value;
 * in particular, zero remains a meaningful booking count or distance.
 */
export function discoveryListingFromPublicListing(
  listing: PublicListingResponse,
  overrides: Partial<ListingCardPresentation> = {},
): DiscoveryListingCardData {
  return {
    listing,
    presentation: {
      originalPrice: overrides.originalPrice ?? null,
      discountPercent: overrides.discountPercent ?? null,
      priceUnit: overrides.priceUnit ?? null,
      ...(overrides.completedBookings !== undefined
        ? { completedBookings: overrides.completedBookings }
        : {}),
      ...(overrides.distanceMeters !== undefined
        ? { distanceMeters: overrides.distanceMeters }
        : {}),
    },
  };
}

export function discoveryListingFromNearbyItem(
  item: NearbyPublicListing,
): DiscoveryListingCardData {
  return {
    listing: {
      id: item.id,
      kind: item.kind,
      title: item.title,
      slug: item.slug,
      listingTypeSlug: item.listingTypeSlug,
      attributes: {},
      photos: item.photos,
      priceFrom: item.priceFrom,
      itemLabel: null,
      ratingAvg: item.ratingAvg,
      reviewCount: item.reviewCount,
      provinceCode: item.provinceCode,
      provinceName: item.provinceName,
      wardCode: item.wardCode,
      wardName: item.wardName,
      address: item.address,
    },
    presentation: {
      originalPrice: item.regularPriceFrom,
      discountPercent: calculateDiscountPercent(item.regularPriceFrom, item.priceFrom),
      priceUnit: item.priceUnit,
      completedBookings: item.completedBookings,
      distanceMeters: item.distanceMeters,
    },
  };
}
