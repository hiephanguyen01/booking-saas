import type { LegalDocumentType } from '@booking/contracts';
import { LEGAL_DOCUMENT_SLUGS } from '@booking/contracts';
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

/** The locale of a pathname's first segment, defaulting to `vi` like every route param does. */
export function pathLocale(pathname: string): Locale {
  return localeFromPath(pathname) ?? 'vi';
}

const segment = (value: string) => encodeURIComponent(value);

/** Auth destinations are never valid post-login return targets. */
export function isStorefrontAuthPath(value: string): boolean {
  const pathname = value.split(/[?#]/, 1)[0];
  return /^\/(?:vi|en)\/auth(?:\/|$)/.test(pathname);
}

/** The steps `/become-partner` nests, in flow order. */
export type PartnerOnboardingStep = 'verify' | 'password' | 'profile' | 'done';

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
  bookingPaymentStatus: (locale: Locale, code: string) =>
    `/${locale}/bookings/${segment(code)}/payment-status`,
  /** Resource routes the booking widget fetches availability, sale summaries and quotes from. */
  listingBookingData: (locale: Locale, listingSlug: string) =>
    `/${locale}/l/${segment(listingSlug)}/booking-data`,
  listingSaleCalendar: (locale: Locale, listingSlug: string) =>
    `/${locale}/l/${segment(listingSlug)}/sale-calendar`,
  listingGroupRoomBookingData: (locale: Locale, groupSlug: string, listingSlug: string) =>
    `/${locale}/g/${segment(groupSlug)}/rooms/${segment(listingSlug)}/booking-data`,
  listingGroupRoomSaleCalendar: (locale: Locale, groupSlug: string, listingSlug: string) =>
    `/${locale}/g/${segment(groupSlug)}/rooms/${segment(listingSlug)}/sale-calendar`,
  /** The four tenant legal documents (§ tenant-legal-documents); stable slugs, never translated. */
  legal: (locale: Locale, docType: LegalDocumentType) =>
    `/${locale}/legal/${LEGAL_DOCUMENT_SLUGS[docType]}`,
  legalVersion: (locale: Locale, docType: LegalDocumentType, versionNo: number) =>
    `/${locale}/legal/${LEGAL_DOCUMENT_SLUGS[docType]}/v/${versionNo}`,
  becomePartner: (locale: Locale) => `/${locale}/become-partner`,
  becomePartnerStep: (locale: Locale, step: PartnerOnboardingStep) =>
    `/${locale}/become-partner/${step}`,
  becomeAffiliate: (locale: Locale) => `/${locale}/become-affiliate`,
  login: (locale: Locale, redirectTo?: string) => {
    const returnTarget = redirectTo && !isStorefrontAuthPath(redirectTo) ? redirectTo : null;
    return `/${locale}/auth/login${returnTarget ? `?redirectTo=${encodeURIComponent(returnTarget)}` : ''}`;
  },
  register: (locale: Locale) => `/${locale}/auth/register`,
  registerVerify: (locale: Locale) => `/${locale}/auth/register/verify`,
  registerPassword: (locale: Locale) => `/${locale}/auth/register/password`,
  registerSuccess: (locale: Locale) => `/${locale}/auth/register/success`,
  forgotPassword: (locale: Locale) => `/${locale}/auth/forgot-password`,
  forgotPasswordVerify: (locale: Locale) => `/${locale}/auth/forgot-password/verify`,
  forgotPasswordNewPassword: (locale: Locale) => `/${locale}/auth/forgot-password/new-password`,
  forgotPasswordSuccess: (locale: Locale) => `/${locale}/auth/forgot-password/success`,
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
