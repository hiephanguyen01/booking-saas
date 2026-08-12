export const TENANT_CACHE = Symbol('TENANT_CACHE');

/** Which surface a resolved hostname serves. Mirrors `tenant_domain_kind`. */
export type TenantHostKind = 'storefront' | 'dashboard';

export interface CachedHost {
  tenantId: string;
  kind: TenantHostKind;
}

/** Answers a cache miss. Supplied by the caller, so the port stays I/O-free. */
export type HostLookup = (hostname: string) => Promise<CachedHost | null>;

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
  /**
   * Read-through: return the cached entry, or call `lookup` and store its answer
   * (including a negative one).
   *
   * THE single place the get→miss→lookup→store sequence lives. Three use-cases
   * resolve hosts against this one key, and three hand-written copies would let
   * an edit to one silently change what the other two see.
   */
  resolveHost(hostname: string, lookup: HostLookup): Promise<CachedHost | null>;
}
