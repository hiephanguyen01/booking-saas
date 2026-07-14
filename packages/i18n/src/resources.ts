import { enBooking } from './locales/en/booking';
import { enCatalog } from './locales/en/catalog';
import { enCheckout } from './locales/en/checkout';
import { enCommon } from './locales/en/common';
import { enErrors } from './locales/en/errors';
import { enListing } from './locales/en/listing';
import { enNavigation } from './locales/en/navigation';
import { viBooking } from './locales/vi/booking';
import { viCatalog } from './locales/vi/catalog';
import { viCheckout } from './locales/vi/checkout';
import { viCommon } from './locales/vi/common';
import { viErrors } from './locales/vi/errors';
import { viListing } from './locales/vi/listing';
import { viNavigation } from './locales/vi/navigation';
import type { TranslationShape } from './locales/translation-shape';

export const supportedLocales = ['vi', 'en'] as const;
export type Locale = (typeof supportedLocales)[number];

export const defaultLocale: Locale = 'vi';
export const defaultNS = 'common' as const;
export const namespaces = [
  'common',
  'navigation',
  'catalog',
  'listing',
  'checkout',
  'booking',
  'errors',
] as const;
export type Namespace = (typeof namespaces)[number];

export const vi = {
  common: viCommon,
  navigation: viNavigation,
  catalog: viCatalog,
  listing: viListing,
  checkout: viCheckout,
  booking: viBooking,
  errors: viErrors,
} as const;

export type Messages = typeof vi;

export const en = {
  common: enCommon,
  navigation: enNavigation,
  catalog: enCatalog,
  listing: enListing,
  checkout: enCheckout,
  booking: enBooking,
  errors: enErrors,
} satisfies TranslationShape<Messages>;

export const resources = { vi, en } as const;

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && supportedLocales.includes(value as Locale);
}
