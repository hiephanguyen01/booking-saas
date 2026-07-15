import { enBooking } from './locales/en/booking';
import { enCatalog } from './locales/en/catalog';
import { enCheckout } from './locales/en/checkout';
import { enCommon } from './locales/en/common';
import { enErrors } from './locales/en/errors';
import { enListing } from './locales/en/listing';
import { enNavigation } from './locales/en/navigation';
import { enAuth } from './locales/en/auth';
import type { TranslationShape } from './locales/translation-shape';
import { viBooking } from './locales/vi/booking';
import { viCatalog } from './locales/vi/catalog';
import { viCheckout } from './locales/vi/checkout';
import { viCommon } from './locales/vi/common';
import { viErrors } from './locales/vi/errors';
import { viListing } from './locales/vi/listing';
import { viNavigation } from './locales/vi/navigation';
import { viAuth } from './locales/vi/auth';
import { NsI18n } from './ns-i18n';

export const supportedLocales = ['vi', 'en'] as const;
export type Locale = (typeof supportedLocales)[number];

export const defaultLocale: Locale = 'vi';
export const defaultNS = NsI18n.Common;
export const namespaces = [
  NsI18n.Common,
  NsI18n.Navigation,
  NsI18n.Catalog,
  NsI18n.Listing,
  NsI18n.Checkout,
  NsI18n.Booking,
  NsI18n.Error,
  NsI18n.Auth,
] as const;
export type Namespace = (typeof namespaces)[number];

export const vi = {
  [NsI18n.Common]: viCommon,
  [NsI18n.Navigation]: viNavigation,
  [NsI18n.Catalog]: viCatalog,
  [NsI18n.Listing]: viListing,
  [NsI18n.Checkout]: viCheckout,
  [NsI18n.Booking]: viBooking,
  [NsI18n.Error]: viErrors,
  [NsI18n.Auth]: viAuth,
} as const;

export type Messages = typeof vi;

export const en = {
  [NsI18n.Common]: enCommon,
  [NsI18n.Navigation]: enNavigation,
  [NsI18n.Catalog]: enCatalog,
  [NsI18n.Listing]: enListing,
  [NsI18n.Checkout]: enCheckout,
  [NsI18n.Booking]: enBooking,
  [NsI18n.Error]: enErrors,
  [NsI18n.Auth]: enAuth,
} satisfies TranslationShape<Messages>;

export const resources = { vi, en } as const;

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && supportedLocales.includes(value as Locale);
}
