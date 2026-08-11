import { useState } from 'react';
import type { DiscoveryListingCardData } from '~/features/catalog/lib/listing-card.types';
import {
  filterHomeListingsByLocation,
  type HomeLocationKey,
} from '~/features/home/lib/home-listing-presentation';

const PAGE_SIZE = 8;

export function useRecommendedSectionController(listings: DiscoveryListingCardData[]) {
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [location, setLocation] = useState<HomeLocationKey>('hcm');
  const filtered = filterHomeListingsByLocation(listings, location);
  const shown = filtered.slice(0, visible);

  function changeLocation(next: HomeLocationKey): void {
    setLocation(next);
    setVisible(PAGE_SIZE);
  }

  function loadMore(): void {
    setVisible((current) => current + PAGE_SIZE);
  }

  return {
    changeLocation,
    hasMore: visible < filtered.length,
    loadMore,
    location,
    shown,
  };
}
