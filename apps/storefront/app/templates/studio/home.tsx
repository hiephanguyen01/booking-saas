import type { PublicListingResponse, PublicListingTypeResponse } from '@booking/contracts';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@booking/ui/components/ui/empty';
import { Camera } from 'lucide-react';
import { useState } from 'react';
import { NsI18n, useTranslation } from '../../lib/i18n';
import type { StorefrontTenant } from '../../lib/tenant.server';
import { StudioHero } from './hero';
import { splitHomeListings } from './home-listing-presentation';
import { RecommendedSection } from './recommended-section';
import { TopListingsSection } from './top-listings-section';

/**
 * Studio-vertical home (§16.1): hero + search, a lead rail, and a flat
 * "recommended" grid — generated from the tenant's data. Both rails derive from
 * the same already-loaded `listings` array (no extra fetch).
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
  const { t } = useTranslation(NsI18n.Common);
  const [selectedType, setSelectedType] = useState(
    listingTypes.find((type) => type.slug === 'studio')?.slug ?? listingTypes[0]?.slug ?? '',
  );
  const visibleListings = selectedType
    ? listings.filter((listing) => listing.listingTypeSlug === selectedType)
    : listings;
  const sections = splitHomeListings(visibleListings);

  return (
    <div className="bg-background">
      <StudioHero
        tenant={tenant}
        listingTypes={listingTypes}
        locations={locations}
        onTypeChange={setSelectedType}
      />
      <div className="mx-auto flex max-w-292.5 flex-col gap-10 px-4 pb-24 sm:px-6 xl:px-0">
        {visibleListings.length > 0 ? (
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
              <EmptyTitle>{t('home.emptyTitle')}</EmptyTitle>
              <EmptyDescription>{t('home.emptyBody')}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </div>
    </div>
  );
}
