import type { Locale } from '@booking/i18n';

export function localeFromPath(pathname: string): Locale | null {
  const first = pathname.split('/').filter(Boolean)[0];
  return first === 'vi' || first === 'en' ? first : null;
}

export function switchLocalePath(location: string, locale: Locale): string {
  const url = new URL(location, 'https://storefront.invalid');
  const segments = url.pathname.split('/').filter(Boolean);
  if (segments[0] === 'vi' || segments[0] === 'en') segments[0] = locale;
  else segments.unshift(locale);
  return `/${segments.join('/')}${url.search}${url.hash}`;
}

const segment = (value: string) => encodeURIComponent(value);

export const storefrontPaths = {
  home: (locale: Locale) => `/${locale}`,
  catalog: (locale: Locale, typeSlug: string) => `/${locale}/t/${segment(typeSlug)}`,
  listing: (locale: Locale, listingSlug: string) => `/${locale}/l/${segment(listingSlug)}`,
  listingGroup: (locale: Locale, groupSlug: string) => `/${locale}/g/${segment(groupSlug)}`,
  checkout: (locale: Locale) => `/${locale}/checkout`,
  bookings: (locale: Locale) => `/${locale}/bookings`,
  booking: (locale: Locale, code: string) => `/${locale}/bookings/${segment(code)}`,
  becomePartner: (locale: Locale) => `/${locale}/become-partner`,
  becomeAffiliate: (locale: Locale) => `/${locale}/become-affiliate`,
} as const;
