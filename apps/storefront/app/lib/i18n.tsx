import { createContext, useContext, type ReactNode } from 'react';
import type { Messages } from './messages';

export type Locale = 'vi' | 'en';

/** Any nested string dictionary — `t()` walks it by dot path. */
type Dict = { [k: string]: string | Dict };

export interface I18n {
  locale: Locale;
  /** `t('checkout.payNow')`, with `{var}` interpolation from `vars`. */
  t: (key: string, vars?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18n | null>(null);

function lookup(dict: Dict, key: string): string | undefined {
  let cur: string | Dict | undefined = dict;
  for (const part of key.split('.')) {
    if (cur && typeof cur === 'object') cur = cur[part];
    else return undefined;
  }
  return typeof cur === 'string' ? cur : undefined;
}

/** Build a translator over a (serialisable) message dictionary. */
export function createTranslator(locale: Locale, messages: Messages): I18n {
  const dict = messages as unknown as Dict;
  const t = (key: string, vars?: Record<string, string | number>): string => {
    const raw = lookup(dict, key);
    if (raw === undefined) return key; // surface the missing key rather than blank
    if (!vars) return raw;
    return raw.replace(/\{(\w+)\}/g, (_, name: string) =>
      vars[name] !== undefined ? String(vars[name]) : `{${name}}`,
    );
  };
  return { locale, t };
}

export function I18nProvider({ value, children }: { value: I18n; children: ReactNode }) {
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useT(): I18n {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useT must be used within <I18nProvider>');
  return ctx;
}
