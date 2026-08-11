import type {
  PublicListingDetailWithTimezoneResponse,
  PublicListingResponse,
  PublicListingTypeResponse,
  PublicListingGroupDetailResponse,
  PublicCatalogSearchResponse,
  PublicCatalogSearchItem,
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
import { publicGetData } from '~/lib/server/api.server';
import { mapWithConcurrency } from '~/lib/server/concurrency.server';
import { getCurrentStorefrontTenant } from '~/lib/server/request-context.server';
import { apiPaths } from '~/constants/api-paths';
import {
  discoveryListingFromCatalogItem,
  publicListingFromCatalogItem,
} from '~/features/catalog/lib/listing-card-presentation';
import type { DiscoveryListingCardData } from '~/features/catalog/lib/listing-card.types';

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
 * entirely from apiPaths.public.listingTypes, so adding a type on the API surfaces it
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

  const pending = publicGetData(request, apiPaths.public.listingTypes, {
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
  return publicGetData(request, apiPaths.public.listingGroup(slug), {
    schema: publicListingGroupDetailResponseSchema,
    allowNotFound: true,
  });
}

export async function fetchListings(
  request: Request,
  search: URLSearchParams,
): Promise<PublicListingResponse[]> {
  const items = await fetchCatalogItems(request, search);
  return items.map(publicListingFromCatalogItem);
}

/** Catalog cards that retain real sale, price-unit and completed-booking metadata. */
export async function fetchDiscoveryListings(
  request: Request,
  search: URLSearchParams,
): Promise<DiscoveryListingCardData[]> {
  const items = await fetchCatalogItems(request, search);
  return items.map(discoveryListingFromCatalogItem);
}

async function fetchCatalogItems(
  request: Request,
  search: URLSearchParams,
): Promise<PublicCatalogSearchItem[]> {
  if (!search.has('type')) {
    const types = await fetchListingTypes(request);
    const batches = await mapWithConcurrency(
      types,
      LISTING_TYPE_FANOUT_CONCURRENCY,
      async (type) => {
        const scoped = new URLSearchParams(search);
        scoped.set('type', type.slug);
        scoped.set('pageSize', '48');
        return fetchCatalogItems(request, scoped);
      },
    );
    return batches.flat();
  }
  const result = await searchListings(request, search);
  return result.items;
}

export function searchListings(
  request: Request,
  search: URLSearchParams,
): Promise<PublicCatalogSearchResponse> {
  return publicGetData(request, apiPaths.public.listings, {
    query: Object.fromEntries(search),
    schema: publicCatalogSearchResponseSchema,
  });
}

export function fetchListing(
  request: Request,
  slug: string,
): Promise<PublicListingDetailWithTimezoneResponse | null> {
  return publicGetData(request, apiPaths.public.listing(slug), {
    schema: publicListingDetailWithTimezoneResponseSchema,
    allowNotFound: true,
  });
}

export function fetchQuote(
  request: Request,
  slug: string,
  query: URLSearchParams,
): Promise<QuoteResponse | null> {
  return publicGetData(request, apiPaths.public.listingQuote(slug), {
    query: Object.fromEntries(query),
    schema: quoteResponseSchema,
    allowNotFound: true,
  });
}
