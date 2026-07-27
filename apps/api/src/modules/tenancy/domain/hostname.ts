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
  return { name: `_bookify-verify.${hostname}`, value: token };
}

/**
 * The TXT value a custom domain must publish. The random half is supplied by the
 * caller (the domain layer never generates randomness) — today
 * `randomBytes(16).toString('hex')`, i.e. 32 hex chars.
 */
export function buildVerificationToken(randomHex: string): string {
  return `bookify-verify=${randomHex}`;
}
