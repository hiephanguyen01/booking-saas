import type { Locale } from '@booking/i18n';

export function localeParam(value: string | undefined): Locale {
  return value === 'en' ? 'en' : 'vi';
}

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
  provider: (locale: Locale, partnerSlug: string) => `/${locale}/p/${segment(partnerSlug)}`,
  favoritesToggle: (locale: Locale) => `/${locale}/favorites/toggle`,
  checkout: (locale: Locale) => `/${locale}/checkout`,
  bookings: (locale: Locale) => `/${locale}/bookings`,
  booking: (locale: Locale, code: string) => `/${locale}/bookings/${segment(code)}`,
  becomePartner: (locale: Locale) => `/${locale}/become-partner`,
  becomeAffiliate: (locale: Locale) => `/${locale}/become-affiliate`,
  login: (locale: Locale, redirectTo?: string) =>
    `/${locale}/auth/login${redirectTo ? `?redirectTo=${encodeURIComponent(redirectTo)}` : ''}`,
  register: (locale: Locale) => `/${locale}/auth/register`,
  forgotPassword: (locale: Locale) => `/${locale}/auth/forgot-password`,
  logout: (locale: Locale) => `/${locale}/auth/logout`,
  community: (locale: Locale) => `/${locale}/community`,
  account: {
    root: (locale: Locale) => `/${locale}/account`,
    profile: (locale: Locale) => `/${locale}/account/profile`,
    bookings: (locale: Locale) => `/${locale}/account/bookings`,
    booking: (locale: Locale, code: string) => `/${locale}/account/bookings/${segment(code)}`,
    messages: (locale: Locale) => `/${locale}/account/messages`,
    reviews: (locale: Locale) => `/${locale}/account/reviews`,
    favorites: (locale: Locale) => `/${locale}/account/favorites`,
    recent: (locale: Locale) => `/${locale}/account/recent`,
    terms: (locale: Locale) => `/${locale}/account/terms`,
    security: (locale: Locale) => `/${locale}/account/security`,
    help: (locale: Locale) => `/${locale}/account/help`,
  },
} as const;
