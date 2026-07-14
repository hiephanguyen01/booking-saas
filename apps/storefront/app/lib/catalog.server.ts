import type {
  PublicListingDetailResponse,
  PublicListingResponse,
  PublicListingTypeResponse,
  PublicListingGroupDetailResponse,
  QuoteResponse,
} from '@booking/contracts';
import { requestPublicJson } from './public-api.server';

/**
 * Server-only catalog fetches (BFF). The storefront menu + filters are generated
 * entirely from `/public/listing-types`, so adding a type on the API surfaces it
 * with no storefront code change (Task 1.3 DoD). Upstream failures remain
 * distinguishable from a legitimate empty catalog.
 */
export async function fetchListingTypes(request: Request): Promise<PublicListingTypeResponse[]> {
  return (
    (await requestPublicJson<PublicListingTypeResponse[]>(request, '/public/listing-types')) ?? []
  );
}

export function fetchListingGroup(
  request: Request,
  slug: string,
): Promise<PublicListingGroupDetailResponse | null> {
  return requestPublicJson<PublicListingGroupDetailResponse>(
    request,
    `/public/listings/groups/${encodeURIComponent(slug)}`,
    { allowNotFound: true },
  );
}

export async function fetchListings(
  request: Request,
  search: URLSearchParams,
): Promise<PublicListingResponse[]> {
  const query = search.toString();
  return (
    (await requestPublicJson<PublicListingResponse[]>(
      request,
      `/public/listings${query ? `?${query}` : ''}`,
    )) ?? []
  );
}

export function fetchListing(
  request: Request,
  slug: string,
): Promise<PublicListingDetailResponse | null> {
  return requestPublicJson<PublicListingDetailResponse>(
    request,
    `/public/listings/${encodeURIComponent(slug)}`,
    { allowNotFound: true },
  );
}

export function fetchQuote(
  request: Request,
  slug: string,
  query: URLSearchParams,
): Promise<QuoteResponse | null> {
  return requestPublicJson<QuoteResponse>(
    request,
    `/public/listings/${encodeURIComponent(slug)}/quote?${query.toString()}`,
    { allowNotFound: true },
  );
}
