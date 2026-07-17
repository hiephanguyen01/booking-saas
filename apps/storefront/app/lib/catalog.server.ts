import type {
  PublicListingDetailResponse,
  PublicListingResponse,
  PublicListingTypeResponse,
  PublicListingGroupDetailResponse,
  PublicCatalogSearchResponse,
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
  if (!search.has('type')) {
    const types = await fetchListingTypes(request);
    const batches = await Promise.all(
      types.map((type) => {
        const scoped = new URLSearchParams(search);
        scoped.set('type', type.slug);
        scoped.set('pageSize', '48');
        return fetchListings(request, scoped);
      }),
    );
    return batches.flat();
  }
  const result = await searchListings(request, search);
  return result.items.map((item) => ({
    id: item.id,
    kind: item.kind,
    title: item.title,
    slug: item.slug,
    listingTypeSlug: item.listingTypeSlug,
    attributes: {},
    photos: item.photos,
    priceFrom: item.priceFrom,
    itemLabel: null,
    provinceCode: item.provinceCode,
    provinceName: item.provinceName,
    wardCode: item.wardCode,
    wardName: item.wardName,
    address: item.address,
  }));
}

export async function searchListings(
  request: Request,
  search: URLSearchParams,
): Promise<PublicCatalogSearchResponse> {
  const query = search.toString();
  return (await requestPublicJson<PublicCatalogSearchResponse>(
    request,
    `/public/listings${query ? `?${query}` : ''}`,
  )) as PublicCatalogSearchResponse;
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
