/**
 * Host-header helpers (TONG-QUAN.md §6.1). A tenant is resolved from the
 * request Host; the default subdomain is `<slug>.<baseDomain>` and a custom
 * domain proves ownership via a TXT record.
 */

/** Strip scheme, path, port and a trailing dot; lowercase. */
export function normalizeHostname(raw: string): string {
  const withoutScheme = raw.trim().toLowerCase().replace(/^https?:\/\//, '');
  const [hostPort = ''] = withoutScheme.split('/');
  const [host = ''] = hostPort.split(':');
  return host.replace(/\.$/, '');
}

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
