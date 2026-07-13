import type { PublicTenantResponse } from '@booking/shared';
import { sanitizeColor } from '../theme/theme';

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
  /** Optional branding pulled from theme_config (§16.2) — all may be empty. */
  logoUrl: string | null;
  /** Favicon URL (§16.2) — empty when the tenant set none. */
  faviconUrl: string | null;
  /** Homepage carousel image URLs (§16.2) — empty when the tenant set none. */
  carousel: string[];
  hero: { title: string | null; subtitle: string | null; imageUrl: string | null };
  seo: { title: string | null; description: string | null };
  contact: { email: string | null; phone: string | null; address: string | null };
  social: {
    facebook: string | null;
    instagram: string | null;
    tiktok: string | null;
    youtube: string | null;
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
    sanitizeColor(colors[key]) ?? DEFAULT_THEME[key];
  return { primary: pick('primary'), accent: pick('accent'), background: pick('background') };
}

/** Read a nested `{group: {key: string}}` value out of themeConfig, or null. */
function readStr(config: Record<string, unknown>, group: string, key: string): string | null {
  const g = config[group];
  if (g && typeof g === 'object') {
    const v = (g as Record<string, unknown>)[key];
    if (typeof v === 'string' && v !== '') return v;
  }
  return null;
}

function toStorefrontTenant(dto: PublicTenantResponse): StorefrontTenant {
  console.log('🚀 ~ toStorefrontTenant ~ dto:', dto);
  const config = dto.themeConfig ?? {};
  const logo = typeof config.logoUrl === 'string' && config.logoUrl !== '' ? config.logoUrl : null;
  const carousel = Array.isArray(config.carousel)
    ? config.carousel.filter((x): x is string => typeof x === 'string' && x !== '')
    : [];
  return {
    id: dto.id,
    name: dto.name,
    slug: dto.slug,
    defaultLocale: dto.defaultLocale,
    vertical: dto.vertical as StorefrontTenant['vertical'],
    live: dto.live,
    theme: readTheme(config),
    logoUrl: logo,
    faviconUrl: readStr(config, 'themeConfig', 'faviconUrl'),
    carousel,
    hero: {
      title: readStr(config, 'hero', 'title'),
      subtitle: readStr(config, 'hero', 'subtitle'),
      imageUrl: readStr(config, 'hero', 'imageUrl'),
    },
    seo: {
      title: readStr(config, 'seo', 'title'),
      description: readStr(config, 'seo', 'description'),
    },
    contact: {
      email: readStr(config, 'contact', 'email'),
      phone: readStr(config, 'contact', 'phone'),
      address: readStr(config, 'contact', 'address'),
    },
    social: {
      facebook: readStr(config, 'socialLinks', 'facebook'),
      instagram: readStr(config, 'socialLinks', 'instagram'),
      tiktok: readStr(config, 'socialLinks', 'tiktok'),
      youtube: readStr(config, 'socialLinks', 'youtube'),
    },
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
