import type {
  PublicCatalogSearchResponse,
  PublicListingDetailResponse,
  PublicListingGroupDetailResponse,
  PublicListingResponse,
  PublicListingTypeResponse,
  QuoteResponse,
} from '@booking/contracts';
import {
  publicCatalogSearchResponseSchema,
  publicListingDetailResponseSchema,
  publicListingGroupDetailResponseSchema,
  publicListingResponseSchema,
  publicListingTypeResponseSchema,
  quoteResponseSchema,
} from '@booking/contracts';
import { z } from 'zod';
import { publicGetData } from './api.server';
import { getCurrentStorefrontTenant } from './request-context.server';

const listingTypesSchema = z.array(publicListingTypeResponseSchema);
const featuredListingsSchema = z.array(publicListingResponseSchema).max(24);
const LISTING_TYPES_CACHE_TTL_MS = 60_000;
const MAX_TENANT_CACHE_ENTRIES = 500;
export const DEFAULT_FEATURED_LISTINGS_PAGE_SIZE = 18;
export const MAX_FEATURED_LISTINGS_PAGE_SIZE = 24;
const listingTypesCache = new Map<
  string,
  { expiresAt: number; data: PublicListingTypeResponse[] }
>();

/**
 * Server-only catalog fetches (BFF). The storefront menu + filters are generated
 * entirely from `/public/listing-types`, so adding a type on the API surfaces it
 * with no storefront code change (Task 1.3 DoD). Upstream failures remain
 * distinguishable from a legitimate empty catalog.
 */
export async function fetchListingTypes(request: Request): Promise<PublicListingTypeResponse[]> {
  const tenantId = getCurrentStorefrontTenant().id;
  const cached = listingTypesCache.get(tenantId);
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.data;
  if (cached) listingTypesCache.delete(tenantId);

  const data = await publicGetData(request, '/public/listing-types', { schema: listingTypesSchema });
  if (listingTypesCache.size >= MAX_TENANT_CACHE_ENTRIES) {
    const oldest = listingTypesCache.keys().next().value as string | undefined;
    if (oldest) listingTypesCache.delete(oldest);
  }
  listingTypesCache.set(tenantId, { expiresAt: now + LISTING_TYPES_CACHE_TTL_MS, data });
  return data;
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

export function featuredListingsPageSize(value: string | number | null | undefined): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return DEFAULT_FEATURED_LISTINGS_PAGE_SIZE;
  return Math.min(parsed, MAX_FEATURED_LISTINGS_PAGE_SIZE);
}

export function fetchFeaturedListings(
  request: Request,
  pageSize: number = DEFAULT_FEATURED_LISTINGS_PAGE_SIZE,
): Promise<PublicListingResponse[]> {
  const bounded = featuredListingsPageSize(pageSize);
  return publicGetData(request, `/public/featured-listings?pageSize=${bounded}`, {
    schema: featuredListingsSchema,
  });
}

export async function fetchListings(
  request: Request,
  search: URLSearchParams,
): Promise<PublicListingResponse[]> {
  if (!search.has('type')) {
    return fetchFeaturedListings(request, featuredListingsPageSize(search.get('pageSize')));
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
): Promise<PublicListingDetailResponse | null> {
  return publicGetData(request, `/public/listings/${encodeURIComponent(slug)}`, {
    schema: publicListingDetailResponseSchema,
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
