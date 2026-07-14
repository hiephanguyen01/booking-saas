import { createInstance, type i18n, type TFunction } from 'i18next';
import { initReactI18next } from 'react-i18next';
import type { TranslationShape } from './locales/translation-shape';
import {
  defaultLocale,
  defaultNS,
  namespaces,
  resources,
  supportedLocales,
} from './resources';
import type { Locale, Messages, Namespace } from './resources';

export { en, vi } from './resources';
export {
  isLocale,
  defaultLocale,
  defaultNS,
  namespaces,
  resources,
  supportedLocales,
} from './resources';
export type { Locale, Messages, Namespace } from './resources';

export function createBookingI18n(locale: Locale): i18n {
  const instance = createInstance();
  instance.use(initReactI18next);
  void instance.init({
    lng: locale,
    fallbackLng: defaultLocale,
    supportedLngs: [...supportedLocales],
    resources,
    ns: [...namespaces],
    defaultNS,
    fallbackNS: defaultNS,
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

export function getServerTranslator(
  locale: Locale,
  namespace: Namespace | Namespace[] = defaultNS,
): TFunction {
  return createBookingI18n(locale).getFixedT(locale, namespace);
}

export function flattenTranslationKeys(messages: TranslationShape<Messages>): string[] {
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
