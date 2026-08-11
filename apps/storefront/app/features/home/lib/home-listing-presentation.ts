import type { DiscoveryListingCardData } from '~/features/catalog/lib/listing-card.types';

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
 * which presented invented popularity as real ranking. They now keep the real
 * catalog presentation metadata, while their order still follows the API's
 * selected sort. Recommendations intentionally reuse the full catalog: a
 * popular studio can also be relevant, and small real catalogs should not lose
 * the entire recommendation section after filling the top rail.
 */
export function splitHomeListings(listings: DiscoveryListingCardData[]): {
  top: DiscoveryListingCardData[];
  recommended: DiscoveryListingCardData[];
} {
  return { top: listings.slice(0, 10), recommended: listings };
}

function normalized(value: string): string {
  return value.trim().toLocaleLowerCase('vi');
}

export function filterHomeListingsByLocation(
  listings: DiscoveryListingCardData[],
  location: HomeLocationKey,
): DiscoveryListingCardData[] {
  const matchers = LOCATION_MATCHERS[location];
  return listings.filter(({ listing }) => {
    const locationText = normalized(
      [listing.address, listing.wardName, listing.provinceName].filter(Boolean).join(' '),
    );
    return matchers.some((matcher) => locationText.includes(matcher));
  });
}
