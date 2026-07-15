import type { PublicListingResponse } from '@booking/contracts';
import type { ListingCardPresentation } from '../../features/catalog/components/listing-card';

export type HomeLocationKey = 'hcm' | 'hanoi' | 'danang' | 'sapa' | 'dalat';

export type HomeListingPresentation = ListingCardPresentation;

export interface HomeListingViewModel {
  listing: PublicListingResponse;
  presentation: HomeListingPresentation;
}

const LOCATION_MATCHERS: Record<HomeLocationKey, string[]> = {
  hcm: ['hồ chí minh', 'ho chi minh', 'tp hcm', 'sài gòn', 'sai gon'],
  hanoi: ['hà nội', 'ha noi'],
  danang: ['đà nẵng', 'da nang'],
  sapa: ['sa pa', 'sapa', 'lào cai', 'lao cai'],
  dalat: ['đà lạt', 'da lat', 'lâm đồng', 'lam dong'],
};

function stableHash(value: string): number {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function roundedOriginalPrice(price: string | null, discountPercent: number): string | null {
  if (!price || discountPercent <= 0 || !/^\d+$/.test(price)) return null;
  const original = Number(price) / (1 - discountPercent / 100);
  if (!Number.isFinite(original)) return null;
  return String(Math.round(original / 1_000) * 1_000);
}

/**
 * The public listing contract does not expose ratings, booking totals, or
 * merchandising discounts yet. These deterministic values are presentation
 * fixtures used to reproduce the approved home-page design in every runtime.
 */
export function homeListingPresentation(listing: PublicListingResponse): HomeListingPresentation {
  const hash = stableHash(`${listing.id}:${listing.slug}`);
  const discountPercent = hash % 4 === 0 ? 0 : 20;
  return {
    rating: 4 + ((hash >>> 4) % 10) / 10,
    bookingCount: 120 + ((hash >>> 8) % 281),
    discountPercent,
    originalPrice: roundedOriginalPrice(listing.priceFrom, discountPercent),
    priceUnit: hash % 3 === 0 ? 'giờ' : 'ngày',
  };
}

export function createHomeListingViewModels(
  listings: PublicListingResponse[],
): HomeListingViewModel[] {
  return listings.map((listing) => ({
    listing,
    presentation: homeListingPresentation(listing),
  }));
}

export function splitHomeListings(viewModels: HomeListingViewModel[]): {
  top: HomeListingViewModel[];
  recommended: HomeListingViewModel[];
} {
  const sorted = [...viewModels].sort(
    (left, right) => right.presentation.bookingCount - left.presentation.bookingCount,
  );
  // Recommendations intentionally reuse the full catalog. A popular studio can
  // also be relevant to the selected city, and small real catalogs should not
  // lose the entire recommendation section after filling the Top 10 rail.
  return { top: sorted.slice(0, 10), recommended: sorted };
}

function normalized(value: string): string {
  return value.trim().toLocaleLowerCase('vi');
}

export function filterHomeListingsByLocation(
  listings: HomeListingViewModel[],
  location: HomeLocationKey,
): HomeListingViewModel[] {
  const matchers = LOCATION_MATCHERS[location];
  return listings.filter(({ listing }) => {
    const locationText = normalized(
      [listing.address, listing.wardName, listing.provinceName].filter(Boolean).join(' '),
    );
    return matchers.some((matcher) => locationText.includes(matcher));
  });
}

export function homeLocationSuggestions(listings: PublicListingResponse[]): string[] {
  return [
    ...new Set(
      listings
        .flatMap((listing) => [listing.wardName, listing.provinceName, listing.address])
        .filter((value): value is string => Boolean(value)),
    ),
  ];
}
