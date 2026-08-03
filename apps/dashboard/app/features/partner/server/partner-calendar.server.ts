import type { ListingResponse } from '@booking/contracts';
import { apiGet, type ApiAuth } from '~/lib/api.server';
import { apiPaths } from '~/constants/api-paths';

/**
 * Map a chosen listing to its real resource id server-side. Re-fetching the
 * partner-scoped listing feed also confirms the listing belongs to this partner
 * (no cross-partner block). Returns `null` when the listing/resource is absent.
 */
export async function resolveListingResource(
  auth: ApiAuth,
  listingId: string,
): Promise<string | null> {
  // Fetch the single partner-scoped listing (the endpoint 404s if it isn't this
  // partner's, so ownership is still enforced) — cheaper + correct now that the
  // list feed is paginated.
  const listingRes = await apiGet<ListingResponse>(apiPaths.partner.listing(listingId), auth);
  return listingRes.ok && listingRes.data ? (listingRes.data.resourceId ?? null) : null;
}
