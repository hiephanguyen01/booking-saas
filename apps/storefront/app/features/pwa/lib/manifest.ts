import type { ThemeConfigInput } from '@booking/contracts';
import type { Locale } from '@booking/i18n';
import { BRAND_DEFAULTS, brandSwatch } from '@booking/ui/lib/brand-theme';

export const PLATFORM_APP_NAME = 'BookingOS';

const PLATFORM_ICONS: ManifestIcon[] = [
  { src: '/pwa/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
  { src: '/pwa/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
  { src: '/pwa/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
];
const PLATFORM_APPLE_TOUCH_ICON = '/pwa/icon-180.png';

const SHORT_NAME_MAX = 12;

export interface ManifestIcon {
  src: string;
  sizes: string;
  type?: string;
  purpose?: 'any' | 'maskable';
}

export interface WebAppManifest {
  id: string;
  name: string;
  short_name: string;
  description?: string;
  lang: Locale;
  dir: 'ltr';
  start_url: string;
  scope: string;
  display: 'standalone';
  display_override: string[];
  orientation: 'portrait-primary';
  theme_color: string;
  background_color: string;
  categories: string[];
  icons: ManifestIcon[];
}

export interface PwaBrand {
  shortName: string;
  themeColor: string;
  backgroundColor: string;
  appleTouchIconUrl: string;
}

export interface PwaTenantBrandInput {
  name: string;
  themeConfig: ThemeConfigInput | null;
}

function shortLabel(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length <= SHORT_NAME_MAX) return trimmed;

  // Word boundary only. A single long word is returned whole and left to the
  // launcher: hard-cutting turns "BookingStudio" into "BookingStudi", which reads
  // as a typo, where every launcher would have shown "BookingStudio…" or simply
  // fitted it. Truncation is a presentation call the platform makes better than we
  // can — the only thing worth doing here is not shipping a mangled word.
  const lastSpace = trimmed.slice(0, SHORT_NAME_MAX + 1).lastIndexOf(' ');
  return lastSpace > 0 ? trimmed.slice(0, lastSpace) : trimmed;
}

export function pwaBrand(tenant: PwaTenantBrandInput | null): PwaBrand {
  const theme = tenant?.themeConfig ?? null;
  const tenantIcons = completeTenantIcons(theme);
  return {
    shortName: shortLabel(tenant?.name ?? PLATFORM_APP_NAME),
    themeColor: brandSwatch(theme?.colors?.primary, BRAND_DEFAULTS.primary).color,
    backgroundColor: brandSwatch(theme?.colors?.background, BRAND_DEFAULTS.background).color,
    appleTouchIconUrl: tenantIcons?.icon180Url ?? PLATFORM_APPLE_TOUCH_ICON,
  };
}

export function buildWebAppManifest({
  tenant,
  locale,
}: {
  tenant: PwaTenantBrandInput | null;
  locale: Locale;
}): WebAppManifest {
  const brand = pwaBrand(tenant);
  const name = tenant?.name.trim() || PLATFORM_APP_NAME;
  const description = tenant?.themeConfig?.hero?.subtitle?.trim();
  const tenantIcons = completeTenantIcons(tenant?.themeConfig ?? null);

  return {
    id: '/',
    name,
    short_name: brand.shortName,
    ...(description ? { description } : {}),
    lang: locale,
    dir: 'ltr',
    start_url: `/${locale}`,
    scope: '/',
    display: 'standalone',
    display_override: ['standalone', 'minimal-ui', 'browser'],
    orientation: 'portrait-primary',
    theme_color: brand.themeColor,
    background_color: brand.backgroundColor,
    categories: ['travel', 'lifestyle', 'business'],
    icons: tenantIcons
      ? [
          { src: tenantIcons.icon192Url, sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: tenantIcons.icon512Url, sizes: '512x512', type: 'image/png', purpose: 'any' },
          ...(tenantIcons.maskable512Url
            ? [
                {
                  src: tenantIcons.maskable512Url,
                  sizes: '512x512',
                  type: 'image/png',
                  purpose: 'maskable' as const,
                },
              ]
            : []),
        ]
      : PLATFORM_ICONS,
  };
}

function completeTenantIcons(theme: ThemeConfigInput | null) {
  const icons = theme?.pwaIcons;
  if (!icons?.icon180Url || !icons.icon192Url || !icons.icon512Url) return null;
  return icons;
}
