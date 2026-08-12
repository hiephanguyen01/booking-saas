import { adminHostTenantResponseSchema, type AdminHostTenantResponse } from '@booking/contracts';
import { apiPublicGet } from './api.server';
import { apiPaths } from '~/constants/api-paths';

export type DashboardHostResolution =
  | { kind: 'platform' }
  | { kind: 'tenant'; tenant: AdminHostTenantResponse }
  | { kind: 'unknown-host' };

/**
 * Host header → hostname. Mirrors the API's canonical parser
 * (`apps/api/src/shared/http/hostname.ts`) and the storefront's copy: first
 * forwarded hop, IPv6 literal unwrapped, port dropped, trailing FQDN dot dropped.
 * The bracket branch returns early — stripping a `:port` off an unwrapped IPv6
 * literal would eat its last group.
 */
export function requestHostname(request: Request): string {
  const hostPort = (request.headers.get('host')?.split(',')[0] ?? '').trim().toLowerCase();
  if (hostPort.startsWith('[')) {
    const end = hostPort.indexOf(']');
    return end === -1 ? '' : hostPort.slice(1, end);
  }
  return (hostPort.split(':')[0] ?? '').replace(/\.$/, '');
}

/**
 * The platform console: the configured DASHBOARD_HOST, a single-label host
 * (`localhost`, a container name), or a bare IP literal. These serve `/admin`
 * without asking the API, exactly as the storefront short-circuits its landing.
 */
function isPlatformHostname(hostname: string): boolean {
  const configured = process.env.DASHBOARD_HOST?.trim().toLowerCase();
  return (
    (configured ? hostname === configured : false) ||
    !hostname.includes('.') ||
    /^[\d.]+$/.test(hostname)
  );
}

export async function resolveDashboardHost(request: Request): Promise<DashboardHostResolution> {
  const hostname = requestHostname(request);
  if (hostname && isPlatformHostname(hostname)) return { kind: 'platform' };

  const result = await apiPublicGet<AdminHostTenantResponse>(apiPaths.public.adminTenant, {
    schema: adminHostTenantResponseSchema,
    headers: { 'x-forwarded-host': hostname },
    signal: request.signal,
  });
  if (result.ok && result.data) return { kind: 'tenant', tenant: result.data };
  if (result.status === 404) return { kind: 'unknown-host' };
  throw new Response('Không phân giải được tên miền quản trị.', { status: 503 });
}
