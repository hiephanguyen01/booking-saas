import { publicTenantResponseSchema, type PublicTenantResponse } from '@booking/contracts';
import { publicGetData } from './api.server';

export type StorefrontTenant = PublicTenantResponse;

export type StorefrontResolution =
  { kind: 'tenant'; tenant: StorefrontTenant } | { kind: 'platform' };

/**
 * Host header → hostname. Mirrors the API's canonical parser
 * (`apps/api/src/shared/http/hostname.ts`): first forwarded hop, IPv6 literal
 * unwrapped, port dropped, trailing FQDN dot dropped. The bracket branch returns
 * early — stripping a `:port` off an unwrapped IPv6 literal would eat its last
 * group. Empty means "no usable host".
 */
function requestHostname(request: Request): string {
  const hostPort = (request.headers.get('host')?.split(',')[0] ?? '').trim().toLowerCase();
  if (hostPort.startsWith('[')) {
    const end = hostPort.indexOf(']');
    return end === -1 ? '' : hostPort.slice(1, end);
  }
  return (hostPort.split(':')[0] ?? '').replace(/\.$/, '');
}

/**
 * Hosts that can never be a tenant's own domain: a single-label host
 * (`localhost`, a container name) or a bare IP literal. These are the platform's
 * own entry points, so they serve the BookingOS landing without asking the API.
 *
 * Deliberately NOT included: any multi-label host. A tenant may map its own apex
 * (`giangstudio.vn`) as well as a subdomain, so those must still go through
 * resolution — an unmapped one comes back UNKNOWN_HOST and lands on the platform
 * page anyway (that is how the production apex `bookingos.vn` resolves).
 */
function isPlatformHostname(hostname: string): boolean {
  return !hostname.includes('.') || /^[\d.]+$/.test(hostname);
}

/**
 * Tenant resolution by Host header (TONG-QUAN.md §6.1). The storefront acts as a
 * BFF: this runs server-side only and calls the API's public resolution endpoint
 * (Host→tenant mapping + Redis cache live on the API). Access is enforced here
 * before any route renders:
 *   - platform host        → BookingOS platform landing, without asking the API
 *   - unmapped host        → BookingOS platform landing (API returns UNKNOWN_HOST)
 *   - suspended / expired  → `live: false` → root renders the suspended page
 */
export async function resolveStorefront(request: Request): Promise<StorefrontResolution> {
  const hostname = requestHostname(request);
  if (hostname && isPlatformHostname(hostname)) return { kind: 'platform' };

  try {
    const dto = await publicGetData(request, '/public/tenant', {
      schema: publicTenantResponseSchema,
    });
    return { kind: 'tenant', tenant: dto };
  } catch (error) {
    if (error instanceof Response && error.status === 404) {
      return { kind: 'platform' };
    }
    if (error instanceof Response && error.status === 503) {
      throw new Response('Storefront temporarily unavailable', { status: 503 });
    }
    throw error;
  }
}
