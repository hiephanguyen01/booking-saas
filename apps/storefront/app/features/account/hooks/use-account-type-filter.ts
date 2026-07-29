import { useState } from 'react';

const ALL_TYPES = 'all';

/**
 * The listing-type tab filter shared by the account's favourites and recently-viewed
 * lists. The two differ only in where the type slug sits on an item, so callers
 * pass a selector rather than each keeping its own copy of this state.
 */
export function useAccountTypeFilter<T>(items: T[], typeSlugOf: (item: T) => string) {
  const [selectedType, setSelectedType] = useState(ALL_TYPES);

  return {
    isAllSelected: selectedType === ALL_TYPES,
    isTypeSelected: (typeSlug: string) => selectedType === typeSlug,
    selectAll: () => setSelectedType(ALL_TYPES),
    selectType: setSelectedType,
    visibleItems:
      selectedType === ALL_TYPES
        ? items
        : items.filter((item) => typeSlugOf(item) === selectedType),
  };
}
