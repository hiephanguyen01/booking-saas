import type {
  ListingResponse,
  ListingTypeResponse,
  ListingGroupResponse,
  PartnerResponse,
} from '@booking/contracts';
import { apiGet, type Auth } from '~/lib/api.server';
import { apiPaths, FETCH_ALL_PAGE_SIZE } from '~/constants/api-paths';

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
    // Paginated list endpoints ({ items, total }) — pull a bounded page for the picker.
    apiGet<{ items: ListingResponse[] }>(apiPaths.tenant.listings, auth, { query: { page: 1, pageSize: FETCH_ALL_PAGE_SIZE } }),
    apiGet<ListingTypeResponse[]>(apiPaths.tenant.listingTypes, auth),
    apiGet<{ items: ListingGroupResponse[] }>(apiPaths.tenant.listingGroups, auth, { query: { page: 1, pageSize: FETCH_ALL_PAGE_SIZE } }),
    apiGet<{ items: PartnerResponse[] }>(apiPaths.tenant.partners, auth, { query: { page: 1, pageSize: FETCH_ALL_PAGE_SIZE } }),
  ]);
  return {
    listings: (listings.ok ? (listings.data?.items ?? []) : []).map((l) => ({ id: l.id, label: l.title })),
    listingTypes: (listingTypes.ok ? (listingTypes.data ?? []) : []).map((t) => ({ id: t.id, label: t.name })),
    listingGroups: (listingGroups.ok ? (listingGroups.data?.items ?? []) : []).map((g) => ({ id: g.id, label: g.title })),
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
    apiGet<{ items: ListingResponse[] }>(apiPaths.partner.listings, auth, { query: { page: 1, pageSize: FETCH_ALL_PAGE_SIZE } }),
    apiGet<{ items: ListingGroupResponse[] }>(apiPaths.partner.listingGroups, auth, { query: { page: 1, pageSize: FETCH_ALL_PAGE_SIZE } }),
  ]);
  return {
    listings: (listings.ok ? (listings.data?.items ?? []) : []).map((l) => ({ id: l.id, label: l.title })),
    listingTypes: [],
    listingGroups: (groups.ok ? (groups.data?.items ?? []) : []).map((g) => ({ id: g.id, label: g.title })),
    partners: [],
  };
}
