/**
 * Host-header helpers (TONG-QUAN.md §6.1). A tenant is resolved from the
 * request Host; the default subdomain is `<slug>.<baseDomain>` and a custom
 * domain proves ownership via a TXT record.
 */

// `normalizeHostname` now lives in `shared/http/hostname.ts` — every module that
// resolves a tenant from the Host header shares that one parser.

export function buildDefaultSubdomain(slug: string, baseDomain: string): string {
  return `${slug}.${baseDomain}`;
}

/** The TXT record a tenant must publish to verify a custom domain. */
export function domainVerificationRecord(
  hostname: string,
  token: string,
): { name: string; value: string } {
  return { name: `_bookingos-verify.${hostname}`, value: token };
}

/**
 * The TXT value a custom domain must publish. The random half is supplied by the
 * caller (the domain layer never generates randomness) — today
 * `randomBytes(16).toString('hex')`, i.e. 32 hex chars.
 */
export function buildVerificationToken(randomHex: string): string {
  return `bookingos-verify=${randomHex}`;
}

/**
 * The reserved first label for a dashboard hostname.
 *
 * This is a routing contract, not a preference. Caddy picks the storefront or
 * dashboard upstream from the Host header alone, with no per-tenant config and no
 * way to ask the API which surface a hostname belongs to (its on-demand-TLS `ask`
 * hook only answers whether a certificate may be issued). The prefix is what makes
 * that decision expressible as a static matcher — see docker/caddy/Caddyfile.
 */
export const ADMIN_HOST_PREFIX = 'admin.';

export function isAdminHostname(hostname: string): boolean {
  return hostname.startsWith(ADMIN_HOST_PREFIX);
}

/** The platform-owned admin subdomain provisioned with every tenant. */
export function buildDefaultAdminSubdomain(slug: string, baseDomain: string): string {
  return `${ADMIN_HOST_PREFIX}${slug}.${baseDomain}`;
}
