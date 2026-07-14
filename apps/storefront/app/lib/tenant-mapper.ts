import type { PublicTenantResponse } from '@booking/contracts';
import { sanitizeColor } from '../theme/theme';

export interface StorefrontTenant {
  id: string;
  name: string;
  slug: string;
  defaultLocale: 'vi' | 'en';
  vertical: 'studio' | 'rental' | 'classes';
  live: boolean;
  theme: {
    primary: string;
    accent: string;
    background: string;
  };
  logoUrl: string | null;
  faviconUrl: string | null;
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

function readTheme(themeConfig: Record<string, unknown>): StorefrontTenant['theme'] {
  const colors =
    typeof themeConfig.colors === 'object' && themeConfig.colors !== null
      ? (themeConfig.colors as Record<string, unknown>)
      : {};
  const pick = (key: keyof typeof DEFAULT_THEME): string =>
    sanitizeColor(colors[key]) ?? DEFAULT_THEME[key];
  return { primary: pick('primary'), accent: pick('accent'), background: pick('background') };
}

function readStr(config: Record<string, unknown>, group: string, key: string): string | null {
  const value = config[group];
  if (value && typeof value === 'object') {
    const nested = (value as Record<string, unknown>)[key];
    if (typeof nested === 'string' && nested !== '') return nested;
  }
  return null;
}

export function toStorefrontTenant(dto: PublicTenantResponse): StorefrontTenant {
  const config = dto.themeConfig ?? {};
  const logoUrl =
    typeof config.logoUrl === 'string' && config.logoUrl !== '' ? config.logoUrl : null;
  const faviconUrl =
    typeof config.faviconUrl === 'string' && config.faviconUrl !== '' ? config.faviconUrl : null;
  const carousel = Array.isArray(config.carousel)
    ? config.carousel.filter((value): value is string => typeof value === 'string' && value !== '')
    : [];

  return {
    id: dto.id,
    name: dto.name,
    slug: dto.slug,
    defaultLocale: dto.defaultLocale,
    vertical: dto.vertical as StorefrontTenant['vertical'],
    live: dto.live,
    theme: readTheme(config),
    logoUrl,
    faviconUrl,
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
