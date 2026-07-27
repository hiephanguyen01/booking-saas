import type {
  PublicListingDetailWithTimezoneResponse,
  PublicListingResponse,
  PublicListingTypeResponse,
  PublicListingGroupDetailResponse,
  PublicCatalogSearchResponse,
  QuoteResponse,
} from '@booking/contracts';
import {
  publicCatalogSearchResponseSchema,
  publicListingDetailWithTimezoneResponseSchema,
  publicListingGroupDetailResponseSchema,
  publicListingTypeResponseSchema,
  quoteResponseSchema,
} from '@booking/contracts';
import { z } from 'zod';
import { publicGetData } from './api.server';
import { mapWithConcurrency } from './concurrency.server';
import { getCurrentStorefrontTenant } from './request-context.server';

const listingTypesSchema = z.array(publicListingTypeResponseSchema);
const LISTING_TYPES_CACHE_TTL_MS = 60_000;
const LISTING_TYPE_FANOUT_CONCURRENCY = 4;
const MAX_TENANT_CACHE_ENTRIES = 500;
const listingTypesCache = new Map<
  string,
  { expiresAt: number; data: PublicListingTypeResponse[] }
>();
const listingTypesReads = new Map<string, Promise<PublicListingTypeResponse[]>>();

function rememberListingTypes(tenantId: string, data: PublicListingTypeResponse[]): void {
  if (listingTypesCache.size >= MAX_TENANT_CACHE_ENTRIES) {
    const oldest = listingTypesCache.keys().next().value as string | undefined;
    if (oldest) listingTypesCache.delete(oldest);
  }
  listingTypesCache.set(tenantId, {
    expiresAt: Date.now() + LISTING_TYPES_CACHE_TTL_MS,
    data,
  });
}

/**
 * Server-only catalog fetches (BFF). The storefront menu + filters are generated
 * entirely from `/public/listing-types`, so adding a type on the API surfaces it
 * with no storefront code change (Task 1.3 DoD). Upstream failures remain
 * distinguishable from a legitimate empty catalog.
 */
export async function fetchListingTypes(request: Request): Promise<PublicListingTypeResponse[]> {
  const tenantId = getCurrentStorefrontTenant().id;
  const cached = listingTypesCache.get(tenantId);
  if (cached && cached.expiresAt > Date.now()) return cached.data;
  if (cached) listingTypesCache.delete(tenantId);

  const existingRead = listingTypesReads.get(tenantId);
  if (existingRead) return existingRead;

  const pending = publicGetData(request, '/public/listing-types', {
    schema: listingTypesSchema,
  })
    .then((data) => {
      rememberListingTypes(tenantId, data);
      return data;
    })
    .finally(() => {
      listingTypesReads.delete(tenantId);
    });
  listingTypesReads.set(tenantId, pending);
  return pending;
}

export function fetchListingGroup(
  request: Request,
  slug: string,
): Promise<PublicListingGroupDetailResponse | null> {
  return publicGetData(request, `/public/listings/groups/${encodeURIComponent(slug)}`, {
    schema: publicListingGroupDetailResponseSchema,
    allowNotFound: true,
  });
}

export async function fetchListings(
  request: Request,
  search: URLSearchParams,
): Promise<PublicListingResponse[]> {
  if (!search.has('type')) {
    const types = await fetchListingTypes(request);
    const batches = await mapWithConcurrency(
      types,
      LISTING_TYPE_FANOUT_CONCURRENCY,
      async (type) => {
        const scoped = new URLSearchParams(search);
        scoped.set('type', type.slug);
        scoped.set('pageSize', '48');
        return fetchListings(request, scoped);
      },
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
    ratingAvg: item.ratingAvg,
    reviewCount: item.reviewCount,
    provinceCode: item.provinceCode,
    provinceName: item.provinceName,
    wardCode: item.wardCode,
    wardName: item.wardName,
    address: item.address,
  }));
}

export function searchListings(
  request: Request,
  search: URLSearchParams,
): Promise<PublicCatalogSearchResponse> {
  const query = search.toString();
  return publicGetData(request, `/public/listings${query ? `?${query}` : ''}`, {
    schema: publicCatalogSearchResponseSchema,
  });
}

export function fetchListing(
  request: Request,
  slug: string,
): Promise<PublicListingDetailWithTimezoneResponse | null> {
  return publicGetData(request, `/public/listings/${encodeURIComponent(slug)}`, {
    schema: publicListingDetailWithTimezoneResponseSchema,
    allowNotFound: true,
  });
}

export function fetchQuote(
  request: Request,
  slug: string,
  query: URLSearchParams,
): Promise<QuoteResponse | null> {
  return publicGetData(
    request,
    `/public/listings/${encodeURIComponent(slug)}/quote?${query.toString()}`,
    { schema: quoteResponseSchema, allowNotFound: true },
  );
}
