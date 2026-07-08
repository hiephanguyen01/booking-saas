/**
 * Tenant resolution by Host header (TONG-QUAN.md §6.1). The storefront acts
 * as a BFF: this runs server-side only.
 *
 * Phase 0 stub: static demo mapping. Phase 1 (task 1.1) replaces the lookup
 * with the API's tenant_domains resolution + Redis cache (60s).
 */
export interface StorefrontTenant {
  id: string;
  name: string;
  slug: string;
  defaultLocale: 'vi' | 'en';
  vertical: 'studio' | 'rental' | 'classes';
  theme: {
    primary: string;
    accent: string;
    background: string;
  };
}

const DEMO_TENANT: StorefrontTenant = {
  id: '00000000-0000-0000-0000-000000000000',
  name: 'StudioHub (demo)',
  slug: 'studiohub',
  defaultLocale: 'vi',
  vertical: 'studio',
  theme: {
    primary: '#0EA5E9',
    accent: '#F97316',
    background: '#FFFFFF',
  },
};

export async function resolveTenant(request: Request): Promise<StorefrontTenant> {
  const host = request.headers.get('host') ?? 'localhost';
  const hostname = host.split(':')[0];
  // TODO(Phase 1): GET /public tenant by hostname via internal API + Redis cache;
  // unknown hostname → 404, suspended tenant → "suspended" page
  return { ...DEMO_TENANT, name: hostname === 'localhost' ? DEMO_TENANT.name : hostname };
}
