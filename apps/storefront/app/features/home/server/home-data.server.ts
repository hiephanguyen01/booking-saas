import type { PublicListingResponse } from '@booking/contracts';
import { fetchListings } from '~/features/catalog/server/catalog.server';

export interface HomeCatalogResult {
  listings: PublicListingResponse[];
}

export async function loadHomeCatalog(request: Request): Promise<HomeCatalogResult> {
  return { listings: await fetchListings(request, new URLSearchParams()) };
}
