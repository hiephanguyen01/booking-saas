export const FAVORITE_TENANT_READER = Symbol('FAVORITE_TENANT_READER');

/** Resolve the storefront tenant from the request Host (favorites are Host-scoped, like reviews). */
export interface IFavoriteTenantReader {
  resolveTenantId(host: string): Promise<string | null>;
}
