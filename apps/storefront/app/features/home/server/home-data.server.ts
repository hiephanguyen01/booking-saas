import type { PublicListingResponse } from '@booking/contracts';
import { fetchListings } from '~/lib/catalog.server';

type ListingFetcher = (
  request: Request,
  search: URLSearchParams,
) => Promise<PublicListingResponse[]>;

export interface HomeCatalogResult {
  listings: PublicListingResponse[];
}

export async function loadHomeCatalog(
  request: Request,
  fetcher: ListingFetcher = fetchListings,
): Promise<HomeCatalogResult> {
  const listings = await fetcher(request, new URLSearchParams());
  return { listings };
}
