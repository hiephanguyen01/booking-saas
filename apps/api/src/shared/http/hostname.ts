/**
 * Host header → the `tenant_domains.hostname` lookup key (TONG-QUAN.md §6.1).
 *
 * ONE canonical parser for every tenant-by-host reader. Until 2026-07-27 this
 * same operation was hand-rolled in 5 places with 3 different behaviours, so the
 * identical request could resolve a tenant in one module and miss in another —
 * e.g. `Host: studiohub.vn.` (a legal trailing-dot FQDN) resolved through
 * tenancy but not through favorites / reviews / content-reports.
 *
 * Handles, in order: a comma-separated forwarded list (`a.vn, b.vn` → first
 * hop), an accidental scheme and path, an IPv6 literal (`[::1]:8080` → `::1`),
 * a port, and a trailing FQDN dot. Always trimmed and lowercased.
 *
 * Returns `''` when nothing usable remains (including a malformed `[…` literal)
 * — callers treat empty as "no tenant" and fail closed rather than querying with
 * a junk key.
 *
 * Pure and dependency-free so `domain/` may import it (mirrors `shared/money`,
 * `shared/time`).
 */
export function normalizeHostname(raw: string): string {
  const firstHop = raw.split(',')[0] ?? '';
  const withoutScheme = firstHop
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '');
  const [hostPort = ''] = withoutScheme.split('/');
  if (hostPort.startsWith('[')) {
    const end = hostPort.indexOf(']');
    return end === -1 ? '' : hostPort.slice(1, end);
  }
  const [host = ''] = hostPort.split(':');
  return host.replace(/\.$/, '');
}
