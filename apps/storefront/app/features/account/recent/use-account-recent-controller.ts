import { useState } from 'react';

const ALL_TYPES = 'all';

type RecentItem = {
  listing: {
    listingTypeSlug: string;
  };
};

export function useAccountRecentController<T extends RecentItem>(items: T[]) {
  const [selectedType, setSelectedType] = useState(ALL_TYPES);
  const visibleItems =
    selectedType === ALL_TYPES
      ? items
      : items.filter((item) => item.listing.listingTypeSlug === selectedType);

  return {
    isAllSelected: selectedType === ALL_TYPES,
    isTypeSelected: (typeSlug: string) => selectedType === typeSlug,
    selectAll: () => setSelectedType(ALL_TYPES),
    selectType: setSelectedType,
    visibleItems,
  };
}
