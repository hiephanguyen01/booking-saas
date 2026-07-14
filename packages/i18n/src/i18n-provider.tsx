import type { i18n } from 'i18next';
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';
import { createBookingI18n, type Locale } from './create-i18n';
import { NsI18n } from './ns-i18n';
import type { Messages, Namespace } from './resources';

type NestedKey<T> = T extends string
  ? never
  : {
      [Key in keyof T & string]: T[Key] extends string ? Key : `${Key}.${NestedKey<T[Key]>}`;
    }[keyof T & string];

export type TranslationKey = {
  [Key in Namespace]: `${Key}.${NestedKey<Messages[Key]>}`;
}[Namespace];

type NamespacedTranslationKey = {
  [Key in Namespace]: `${Key}:${NestedKey<Messages[Key]>}`;
}[Namespace];

export type NamespaceTranslationKey<TNamespace extends Namespace> = NestedKey<
  Messages[TNamespace]
>;

export interface I18n {
  locale: Locale;
  instance: i18n;
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
}

export interface ScopedI18n<TNamespace extends Namespace> {
  locale: Locale;
  instance: i18n;
  t: (
    key: NamespaceTranslationKey<TNamespace>,
    vars?: Record<string, string | number>,
  ) => string;
}

interface RuntimeI18n {
  exists: (key: string, options: { ns: Namespace }) => boolean;
  t: (
    key: string,
    options: Record<string, string | number> & { ns: Namespace },
  ) => unknown;
}

function namespacedKey(key: TranslationKey): NamespacedTranslationKey {
  const separator = key.indexOf('.');
  return (
    separator === -1 ? key : `${key.slice(0, separator)}:${key.slice(separator + 1)}`
  ) as NamespacedTranslationKey;
}

export function createTranslator(locale: Locale): I18n {
  const instance = createBookingI18n(locale);
  return {
    locale,
    instance,
    t(key, vars) {
      const normalized = namespacedKey(key);
      if (!instance.exists(normalized)) return key;
      return String(instance.t(normalized, vars));
    },
  };
}

const I18nContext = createContext<I18n | null>(null);

export function I18nProvider({ value, children }: { value: I18n; children: ReactNode }) {
  return (
    <I18nextProvider i18n={value.instance} defaultNS={NsI18n.Common}>
      <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
    </I18nextProvider>
  );
}

export function BookingI18nProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  const value = useMemo(() => createTranslator(locale), [locale]);
  return <I18nProvider value={value}>{children}</I18nProvider>;
}

export function useTranslation<TNamespace extends Namespace>(
  namespace: TNamespace,
): ScopedI18n<TNamespace> {
  const context = useContext(I18nContext);
  if (!context) throw new Error('useTranslation must be used within <I18nProvider>');

  return useMemo(
    () => {
      // i18next's augmented overloads cannot represent a generic namespace at
      // runtime, so keep the cast at this adapter boundary. Call sites remain
      // fully typed by NamespaceTranslationKey<TNamespace>.
      const runtime = context.instance as unknown as RuntimeI18n;

      return {
        locale: context.locale,
        instance: context.instance,
        t(key: NamespaceTranslationKey<TNamespace>, vars = {}) {
          if (!runtime.exists(key, { ns: namespace })) return key;
          return String(runtime.t(key, { ...vars, ns: namespace }));
        },
      };
    },
    [context, namespace],
  );
}
