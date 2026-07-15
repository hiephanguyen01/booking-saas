import type { PublicListingResponse, PublicListingTypeResponse } from '@booking/contracts';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@booking/ui/components/ui/empty';
import { Camera } from 'lucide-react';
import type { StorefrontTenant } from '../../lib/tenant.server';
import { StudioHero } from './hero';
import { createHomeListingViewModels, splitHomeListings } from './home-listing-presentation';
import { StudioPromoBanner } from './promo-banner';
import { RecommendedSection } from './recommended-section';
import { TopListingsSection } from './top-listings-section';

/**
 * Studio-vertical home (§16.1): hero + search, a promo banner, a "Top 10"
 * row, and a flat "recommended" grid — generated from the tenant's data.
 * `Top 10` and `Recommended` derive from the same already-loaded `listings`
 * array (no extra fetch); see `top-listings-section.tsx` for why "Top 10"
 * uses deterministic presentation metadata rather than analytics.
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
  const sections = splitHomeListings(createHomeListingViewModels(listings));

  return (
    <div className="bg-[#f9fafb]">
      <StudioHero tenant={tenant} listingTypes={listingTypes} locations={locations} />
      <div className="mx-auto flex max-w-292.5 flex-col gap-10 px-4 pb-24 sm:px-6 xl:px-0">
        <StudioPromoBanner tenant={tenant} />
        {listings.length > 0 ? (
          <>
            <TopListingsSection listings={sections.top} />
            <RecommendedSection listings={sections.recommended} />
          </>
        ) : (
          <Empty className="border border-border bg-card py-20">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Camera aria-hidden="true" />
              </EmptyMedia>
              <EmptyTitle>Chưa có studio phù hợp</EmptyTitle>
              <EmptyDescription>
                Các studio mới sẽ xuất hiện tại đây ngay khi được xuất bản.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </div>
    </div>
  );
}
