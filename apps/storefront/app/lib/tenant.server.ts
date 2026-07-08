import type { PublicTenantResponse } from '@booking/shared';

/**
 * Tenant resolution by Host header (TONG-QUAN.md §6.1). The storefront acts as a
 * BFF: this runs server-side only and calls the API's public resolution endpoint
 * (Host→tenant mapping + Redis cache live on the API). Access is enforced here
 * before any route renders:
 *   - unmapped host        → 404 (API returns UNKNOWN_HOST)
 *   - suspended / expired  → `live: false` → root renders the suspended page
 */
export interface StorefrontTenant {
  id: string;
  name: string;
  slug: string;
  defaultLocale: 'vi' | 'en';
  vertical: 'studio' | 'rental' | 'classes';
  /** Whether the storefront is open — false when tenant suspended or subscription expired. */
  live: boolean;
  theme: {
    primary: string;
    accent: string;
    background: string;
  };
}

const DEFAULT_THEME = { primary: '#0EA5E9', accent: '#F97316', background: '#FFFFFF' } as const;

const backendUrl = (): string => process.env.BACKEND_URL ?? 'http://localhost:3000';

/** Pull `{ colors: { primary, accent, background } }` out of the tenant's themeConfig jsonb. */
function readTheme(themeConfig: Record<string, unknown>): StorefrontTenant['theme'] {
  const colors =
    themeConfig && typeof themeConfig.colors === 'object' && themeConfig.colors !== null
      ? (themeConfig.colors as Record<string, unknown>)
      : {};
  const pick = (key: keyof typeof DEFAULT_THEME): string =>
    typeof colors[key] === 'string' ? (colors[key] as string) : DEFAULT_THEME[key];
  return { primary: pick('primary'), accent: pick('accent'), background: pick('background') };
}

function toStorefrontTenant(dto: PublicTenantResponse): StorefrontTenant {
  return {
    id: dto.id,
    name: dto.name,
    slug: dto.slug,
    defaultLocale: dto.defaultLocale,
    vertical: dto.vertical as StorefrontTenant['vertical'],
    live: dto.live,
    theme: readTheme(dto.themeConfig),
  };
}

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
