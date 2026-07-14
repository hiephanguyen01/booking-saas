import type { PublicTenantResponse } from '@booking/contracts';
import { toStorefrontTenant, type StorefrontTenant } from './tenant-mapper';

export type { StorefrontTenant } from './tenant-mapper';

/**
 * Tenant resolution by Host header (TONG-QUAN.md §6.1). The storefront acts as a
 * BFF: this runs server-side only and calls the API's public resolution endpoint
 * (Host→tenant mapping + Redis cache live on the API). Access is enforced here
 * before any route renders:
 *   - unmapped host        → 404 (API returns UNKNOWN_HOST)
 *   - suspended / expired  → `live: false` → root renders the suspended page
 */
const backendUrl = (): string => process.env.BACKEND_URL ?? 'http://localhost:3000';

export async function resolveTenant(request: Request): Promise<StorefrontTenant> {
  const hostname = (request.headers.get('host') ?? 'localhost').split(':')[0];

  let response: Response;
  try {
    response = await fetch(`${backendUrl()}/public/tenant`, {
      headers: { 'x-forwarded-host': hostname, accept: 'application/json' },
    });
  } catch {
    // API unreachable — fail closed rather than serving a fabricated storefront.
    throw new Response('Storefront temporarily unavailable', { status: 503 });
  }

  if (response.status === 404) {
    // No tenant is mapped to this hostname.
    throw new Response(`No storefront found for "${hostname}"`, { status: 404 });
  }
  if (!response.ok) {
    throw new Response('Storefront temporarily unavailable', { status: 503 });
  }

  const dto = (await response.json()) as PublicTenantResponse;
  return toStorefrontTenant(dto);
}
