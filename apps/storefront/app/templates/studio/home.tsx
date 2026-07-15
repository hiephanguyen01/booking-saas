import type { PublicListingResponse, PublicListingTypeResponse } from '@booking/contracts';
import type { StorefrontTenant } from '../../lib/tenant.server';
import { StudioCarousel } from './carousel';
import { StudioHero } from './hero';
import { StudioPromoBanner } from './promo-banner';
import { RecommendedSection } from './recommended-section';
import { TopListingsSection } from './top-listings-section';

const TOP_LISTINGS_COUNT = 10;

/**
 * Studio-vertical home (§16.1): hero + search, a promo banner, a "Top 10"
 * row, and a flat "recommended" grid — generated from the tenant's data.
 * `Top 10` / `Recommended` split the same already-loaded `listings` array
 * (no extra fetch); see `top-listings-section.tsx` for why "Top 10" isn't a
 * real popularity ranking.
 */
export function StudioHome({
  tenant,
  listingTypes,
  listings,
  locations,
}: {
  tenant: StorefrontTenant;
  listingTypes: PublicListingTypeResponse[];
  listings: PublicListingResponse[];
  locations: string[];
}) {
  return (
    <>
      <StudioHero tenant={tenant} listingTypes={listingTypes} locations={locations} />
      <StudioCarousel images={tenant.carousel} />
      <div className="mx-auto max-w-292.5 space-y-10 px-6 lg:px-0 py-10">
        <StudioPromoBanner tenant={tenant} />
        <TopListingsSection listings={listings.slice(0, TOP_LISTINGS_COUNT)} />
        <RecommendedSection listings={listings.slice(TOP_LISTINGS_COUNT)} />
      </div>
    </>
  );
}
