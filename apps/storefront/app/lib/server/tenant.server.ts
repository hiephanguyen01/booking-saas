import { publicTenantResponseSchema, type PublicTenantResponse } from '@booking/contracts';
import { publicGetData } from './api.server';

export type StorefrontTenant = PublicTenantResponse;

export type StorefrontResolution =
  { kind: 'tenant'; tenant: StorefrontTenant } | { kind: 'platform' };

/**
 * Tenant resolution by Host header (TONG-QUAN.md §6.1). The storefront acts as a
 * BFF: this runs server-side only and calls the API's public resolution endpoint
 * (Host→tenant mapping + Redis cache live on the API). Access is enforced here
 * before any route renders:
 *   - unmapped host        → BookingOS platform landing (API returns UNKNOWN_HOST)
 *   - suspended / expired  → `live: false` → root renders the suspended page
 */
export async function resolveStorefront(request: Request): Promise<StorefrontResolution> {
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
