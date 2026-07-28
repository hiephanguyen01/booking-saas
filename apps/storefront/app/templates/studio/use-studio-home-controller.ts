import type { PublicListingResponse, PublicListingTypeResponse } from '@booking/contracts';
import { useState } from 'react';
import { useMinimumPendingPulse } from '~/hooks/use-minimum-pending';
import { splitHomeListings } from './home-listing-presentation';

export function useStudioHomeController({
  listingTypes,
  listings,
}: {
  listingTypes: PublicListingTypeResponse[];
  listings: PublicListingResponse[];
}) {
  // Default to the tenant's first listing type (by sortOrder from the API) — never a
  // hard-coded slug, so the home reflects whatever types the tenant actually created.
  const [selectedType, setSelectedType] = useState(listingTypes[0]?.slug ?? '');
  const [filterPending, triggerFilterPending] = useMinimumPendingPulse();
  const selectedListingType = listingTypes.find((type) => type.slug === selectedType);
  const visibleListings = selectedType
    ? listings.filter((listing) => listing.listingTypeSlug === selectedType)
    : listings;
  const sections = splitHomeListings(visibleListings);

  function changeType(nextType: string): void {
    if (nextType === selectedType) return;

    setSelectedType(nextType);
    triggerFilterPending();
  }

  return {
    changeType,
    filterPending,
    hasVisibleListings: visibleListings.length > 0,
    sections,
    selectedListingTypeName: selectedListingType?.name ?? '',
  };
}
