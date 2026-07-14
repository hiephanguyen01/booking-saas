import { createInstance, type i18n } from 'i18next';
import { initReactI18next } from 'react-i18next';
import { en, vi } from './resources';

export { en, vi } from './resources';
export const supportedLocales = ['vi', 'en'] as const;
export type Locale = (typeof supportedLocales)[number];
export type Messages = typeof vi;
export type Namespace = keyof Messages;

export const defaultLocale: Locale = 'vi';
export const resources = { vi, en } as const;

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && supportedLocales.includes(value as Locale);
}

export function createBookingI18n(locale: Locale): i18n {
  const instance = createInstance();
  instance.use(initReactI18next);
  void instance.init({
    lng: locale,
    fallbackLng: defaultLocale,
    supportedLngs: [...supportedLocales],
    resources,
    ns: Object.keys(vi),
    defaultNS: 'common',
    fallbackNS: 'common',
    initAsync: false,
    returnNull: false,
    interpolation: {
      escapeValue: false,
      prefix: '{',
      suffix: '}',
    },
    react: { useSuspense: false },
  });
  return instance;
}

export function flattenTranslationKeys(messages: Messages): string[] {
  const keys: string[] = [];

  function visit(value: unknown, prefix: string): void {
    if (typeof value === 'string') {
      keys.push(prefix);
      return;
    }
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      visit(child, prefix ? `${prefix}.${key}` : key);
    }
  }

  visit(messages, '');
  return keys.sort();
}
