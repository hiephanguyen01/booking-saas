import type { PublicListingResponse } from '@booking/contracts';

export type HomeLocationKey = 'hcm' | 'hanoi' | 'danang' | 'sapa' | 'dalat';

const LOCATION_MATCHERS: Record<HomeLocationKey, string[]> = {
  hcm: ['hồ chí minh', 'ho chi minh', 'tp hcm', 'sài gòn', 'sai gon'],
  hanoi: ['hà nội', 'ha noi'],
  danang: ['đà nẵng', 'da nang'],
  sapa: ['sa pa', 'sapa', 'lào cai', 'lao cai'],
  dalat: ['đà lạt', 'da lat', 'lâm đồng', 'lam dong'],
};

/**
 * Split the loaded catalog into the two home rails.
 *
 * The rails used to be ordered by a booking count hashed from the listing id,
 * which presented invented popularity as real ranking. Until the public
 * contract exposes booking totals there is nothing to rank on, so both rails
 * follow the order the API returned. Recommendations intentionally reuse the
 * full catalog: a popular studio can also be relevant, and small real catalogs
 * should not lose the entire recommendation section after filling the top rail.
 */
export function splitHomeListings(listings: PublicListingResponse[]): {
  top: PublicListingResponse[];
  recommended: PublicListingResponse[];
} {
  return { top: listings.slice(0, 10), recommended: listings };
}

function normalized(value: string): string {
  return value.trim().toLocaleLowerCase('vi');
}

export function filterHomeListingsByLocation(
  listings: PublicListingResponse[],
  location: HomeLocationKey,
): PublicListingResponse[] {
  const matchers = LOCATION_MATCHERS[location];
  return listings.filter((listing) => {
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
