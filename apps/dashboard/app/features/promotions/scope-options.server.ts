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
export async function loadTenantScopeOptions(auth: Auth): Promise<ScopeOptions> {
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

/**
 * Scope options for the PARTNER promotion surface: the partner's own listings and
 * listing groups (the only pickable targets — the `partner` scope auto-targets the
 * partner itself, and types/partners are tenant-only scopes, so those stay empty).
 * Same degrade-to-empty policy as the tenant loader.
 */
export async function loadPartnerScopeOptions(auth: Auth): Promise<ScopeOptions> {
  const [listings, groups] = await Promise.all([
    apiGet<ListingResponse[]>('/partner/listings', auth),
    apiGet<ListingGroupResponse[]>('/partner/listing-groups', auth),
  ]);
  return {
    listings: (listings.ok ? (listings.data ?? []) : []).map((l) => ({ id: l.id, label: l.title })),
    listingTypes: [],
    listingGroups: (groups.ok ? (groups.data ?? []) : []).map((g) => ({ id: g.id, label: g.title })),
    partners: [],
  };
}
