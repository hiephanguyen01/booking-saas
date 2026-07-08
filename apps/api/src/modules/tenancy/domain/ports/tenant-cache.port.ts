export const TENANT_CACHE = Symbol('TENANT_CACHE');

/**
 * Host → tenant resolution cache (§6.1), Redis-backed with a 60s TTL. Unknown
 * hosts are negatively cached (tenantId = null) so a flood of requests for a
 * bogus Host cannot hammer the database.
 */
export interface ITenantCache {
  /** `undefined` = cache miss; `null` = negatively cached (no such host); string = tenantId. */
  getHost(hostname: string): Promise<string | null | undefined>;
  setHost(hostname: string, tenantId: string | null): Promise<void>;
  invalidateHost(hostname: string): Promise<void>;
}
