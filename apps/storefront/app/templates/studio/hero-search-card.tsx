import type { PublicListingTypeResponse } from '@booking/contracts';
import { SearchForm } from '../../features/search/search-form';

export function HeroSearchCard({
  listingTypes,
  locations,
}: {
  listingTypes: PublicListingTypeResponse[];
  locations: string[];
}) {
  return <SearchForm listingTypes={listingTypes} locations={locations} variant="hero" />;
}
