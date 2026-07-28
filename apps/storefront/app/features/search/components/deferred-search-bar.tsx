import type { PublicListingTypeResponse } from '@booking/contracts';
import { Suspense } from 'react';
import { Await, useSearchParams } from 'react-router';
import { SearchBarSkeleton } from '~/components/loading-skeletons';
import { NsI18n, useTranslation } from '~/lib/i18n';
import { SearchForm, type LocationOption } from './search-form';
import { parseSearchState } from '~/features/search/lib/search-state';

/**
 * The sticky top search bar shared by the listing and package detail pages.
 * Both render `locations` as the same deferred loader promise, so the
 * Suspense/Await wiring lives here once instead of in each page.
 */
export function DeferredSearchBar({
  listingTypes,
  currentType,
  locations,
  today,
}: {
  listingTypes: PublicListingTypeResponse[];
  currentType: string;
  locations: Promise<LocationOption[]>;
  today: string;
}) {
  const [searchParams] = useSearchParams();
  const { t } = useTranslation(NsI18n.Common);
  return (
    <Suspense fallback={<SearchBarSkeleton label={t('loading')} />}>
      <Await resolve={locations}>
        {(resolvedLocations) => (
          <SearchForm
            key={searchParams.toString()}
            listingTypes={listingTypes}
            currentType={currentType}
            initialState={parseSearchState(searchParams, today)}
            locations={resolvedLocations}
            variant="bar"
          />
        )}
      </Await>
    </Suspense>
  );
}
