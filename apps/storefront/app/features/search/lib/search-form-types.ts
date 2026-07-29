import type { PublicListingTypeResponse } from '@booking/contracts';
import type { StorefrontSearchState } from '~/features/search/lib/search-state';

export type DateRange = { from: Date | undefined; to?: Date | undefined };
export type LocationOption = string | { value: string; label: string };
export type SearchFormVariant = 'hero' | 'bar';
export type TypeChangeBehavior = 'local' | 'navigate-to-catalog';

export interface SearchFormOptions {
  listingTypes: PublicListingTypeResponse[];
  currentType?: string;
  initialState?: StorefrontSearchState;
  locations: LocationOption[];
  onTypeChange?: (typeSlug: string) => void;
  typeChangeBehavior?: TypeChangeBehavior;
}

export interface SearchFormProps extends Omit<SearchFormOptions, 'locations'> {
  locations?: LocationOption[];
  variant: SearchFormVariant;
}
