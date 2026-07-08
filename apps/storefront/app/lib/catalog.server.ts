import type { PublicListingResponse, PublicListingTypeResponse } from '@booking/shared';

/**
 * Server-only catalog fetches (BFF). The storefront menu + filters are generated
 * entirely from `/public/listing-types`, so adding a type on the API surfaces it
 * with no storefront code change (Task 1.3 DoD). Failures are non-fatal — the
 * menu/results just render empty.
 */
const backendUrl = (): string => process.env.BACKEND_URL ?? 'http://localhost:3000';

function hostOf(request: Request): string {
  return (request.headers.get('host') ?? 'localhost').split(':')[0];
}

export async function fetchListingTypes(request: Request): Promise<PublicListingTypeResponse[]> {
  try {
    const res = await fetch(`${backendUrl()}/public/listing-types`, {
      headers: { 'x-forwarded-host': hostOf(request), accept: 'application/json' },
    });
    if (!res.ok) return [];
    return (await res.json()) as PublicListingTypeResponse[];
  } catch {
    return [];
  }
}

export async function fetchListings(
  request: Request,
  search: URLSearchParams,
): Promise<PublicListingResponse[]> {
  try {
    const qs = search.toString();
    const res = await fetch(`${backendUrl()}/public/listings${qs ? `?${qs}` : ''}`, {
      headers: { 'x-forwarded-host': hostOf(request), accept: 'application/json' },
    });
    if (!res.ok) return [];
    return (await res.json()) as PublicListingResponse[];
  } catch {
    return [];
  }
}
