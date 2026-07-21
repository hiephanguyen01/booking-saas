import type { PublicListingTypeResponse } from '@booking/contracts';
import { Suspense } from 'react';
import { Await, useSearchParams } from 'react-router';
import { useStorefrontTimezone } from '../../lib/use-storefront-context';
import { SearchForm, type LocationOption } from './search-form';
import { parseSearchState } from './search-state';

/**
 * The sticky top search bar shared by the listing and package detail pages.
 * Both render `locations` as the same deferred loader promise, so the
 * Suspense/Await wiring lives here once instead of in each page.
 */
export function DeferredSearchBar({
  listingTypes,
  currentType,
  locations,
}: {
  listingTypes: PublicListingTypeResponse[];
  currentType: string;
  locations: Promise<LocationOption[]>;
}) {
  const [searchParams] = useSearchParams();
  const timezone = useStorefrontTimezone();
  return (
    <Suspense fallback={<div className="h-39 bg-foreground" />}>
      <Await resolve={locations}>
        {(resolvedLocations) => (
          <SearchForm
            key={searchParams.toString()}
            listingTypes={listingTypes}
            currentType={currentType}
            initialState={parseSearchState(searchParams, timezone)}
            locations={resolvedLocations}
            variant="bar"
          />
        )}
      </Await>
    </Suspense>
  );
}
