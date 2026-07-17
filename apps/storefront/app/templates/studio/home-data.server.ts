import type { PublicListingResponse } from '@booking/contracts';
import { storefrontEnv } from '../../lib/env.server';
import { fetchListings } from '../../lib/catalog.server';
import { HOME_LISTING_FIXTURES } from './home-listing-fixtures';

type ListingFetcher = (
  request: Request,
  search: URLSearchParams,
) => Promise<PublicListingResponse[]>;

export interface HomeCatalogResult {
  listings: PublicListingResponse[];
  usesFixtures: boolean;
}

export async function loadHomeCatalog(
  request: Request,
  environment = storefrontEnv.nodeEnv,
  fetcher: ListingFetcher = fetchListings,
): Promise<HomeCatalogResult> {
  try {
    const listings = await fetcher(request, new URLSearchParams());
    if (listings.length > 0 || environment === 'production') {
      return { listings, usesFixtures: false };
    }
  } catch (error) {
    if (environment === 'production') throw error;
  }

  return { listings: HOME_LISTING_FIXTURES, usesFixtures: true };
}
