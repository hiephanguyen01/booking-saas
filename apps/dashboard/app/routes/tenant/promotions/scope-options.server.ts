import type {
  ListingResponse,
  ListingTypeResponse,
  ListingGroupResponse,
  PartnerResponse,
} from '@booking/contracts';
import { apiGet, type Auth } from '~/lib/api.server';

export interface ScopeOption {
  id: string;
  label: string;
}

/** Option lists that back the promotion scope (`appliesToId`) picker. */
export interface ScopeOptions {
  listings: ScopeOption[];
  listingTypes: ScopeOption[];
  listingGroups: ScopeOption[];
  partners: ScopeOption[];
}

/**
 * Best-effort fetch of the tenant's listings / types / groups / partners so the
 * promotion form can offer a friendly scope picker (falls back to a raw id input
 * when a list is unavailable). Failures degrade to empty lists — never block the form.
 */
export async function loadScopeOptions(auth: Auth): Promise<ScopeOptions> {
  const [listings, listingTypes, listingGroups, partners] = await Promise.all([
    // `/tenant/listings` is paginated ({ items, total }); the others still return bare arrays.
    apiGet<{ items: ListingResponse[] }>('/tenant/listings?page=1&pageSize=100', auth),
    apiGet<ListingTypeResponse[]>('/tenant/listing-types', auth),
    apiGet<ListingGroupResponse[]>('/tenant/listing-groups', auth),
    apiGet<{ items: PartnerResponse[] }>('/tenant/partners?page=1&pageSize=100', auth),
  ]);
  return {
    listings: (listings.ok ? (listings.data?.items ?? []) : []).map((l) => ({ id: l.id, label: l.title })),
    listingTypes: (listingTypes.ok ? (listingTypes.data ?? []) : []).map((t) => ({ id: t.id, label: t.name })),
    listingGroups: (listingGroups.ok ? (listingGroups.data ?? []) : []).map((g) => ({ id: g.id, label: g.title })),
    partners: (partners.ok ? (partners.data?.items ?? []) : []).map((p) => ({ id: p.id, label: p.name })),
  };
}
