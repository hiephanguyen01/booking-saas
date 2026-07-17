import type { ListingResponse } from '@booking/contracts';
import { apiGet, type ApiAuth } from '~/lib/api.server';

/**
 * Map a chosen listing to its real resource id server-side. Re-fetching the
 * partner-scoped listing feed also confirms the listing belongs to this partner
 * (no cross-partner block). Returns `null` when the listing/resource is absent.
 */
export async function resolveListingResource(
  auth: ApiAuth,
  listingId: string,
): Promise<string | null> {
  const listingsRes = await apiGet<ListingResponse[]>('/partner/listings', auth);
  const listing =
    listingsRes.ok && listingsRes.data
      ? listingsRes.data.find((l) => l.id === listingId)
      : undefined;
  return listing?.resourceId ?? null;
}
