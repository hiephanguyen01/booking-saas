import type { DiscoveryListingCardData } from '~/features/catalog/lib/listing-card.types';
import { fetchDiscoveryListings } from '~/features/catalog/server/catalog.server';

export interface HomeCatalogResult {
  listings: DiscoveryListingCardData[];
}

export async function loadHomeCatalog(request: Request): Promise<HomeCatalogResult> {
  return { listings: await fetchDiscoveryListings(request, new URLSearchParams()) };
}
