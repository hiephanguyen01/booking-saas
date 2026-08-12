export const TENANT_CACHE = Symbol('TENANT_CACHE');

/** Which surface a resolved hostname serves. Mirrors `tenant_domain_kind`. */
export type TenantHostKind = 'storefront' | 'dashboard';

export interface CachedHost {
  tenantId: string;
  kind: TenantHostKind;
}

/**
 * Host → tenant resolution cache (§6.1), Redis-backed with a 60s TTL. Unknown
 * hosts are negatively cached (null) so a flood of requests for a bogus Host
 * cannot hammer the database.
 *
 * The entry carries `kind` because one table now maps both storefront and
 * dashboard hostnames, and a caller that wants one must never be handed the
 * other.
 */
export interface ITenantCache {
  /** `undefined` = cache miss; `null` = negatively cached (no such host). */
  getHost(hostname: string): Promise<CachedHost | null | undefined>;
  setHost(hostname: string, value: CachedHost | null): Promise<void>;
  invalidateHost(hostname: string): Promise<void>;
}
