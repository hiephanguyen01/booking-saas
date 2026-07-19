import type { Locale } from './create-i18n';

const intlLocale: Record<Locale, string> = { vi: 'vi-VN', en: 'en-US' };
const currencyFormatters = new Map<string, Intl.NumberFormat>();
const dateFormatters = new Map<string, Intl.DateTimeFormat>();
const dateTimeFormatters = new Map<string, Intl.DateTimeFormat>();

export function formatCurrency(value: number | bigint, currency: string, locale: Locale): string {
  const key = `${locale}:${currency}`;
  let formatter = currencyFormatters.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(intlLocale[locale], {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    });
    currencyFormatters.set(key, formatter);
  }
  return formatter.format(value);
}

export function formatDate(value: string | Date, locale: Locale, timeZone?: string): string {
  const key = `${locale}:${timeZone ?? ''}`;
  let formatter = dateFormatters.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(intlLocale[locale], {
      dateStyle: 'medium',
      timeZone,
    });
    dateFormatters.set(key, formatter);
  }
  return formatter.format(typeof value === 'string' ? new Date(value) : value);
}

export function formatDateTime(value: string | Date, locale: Locale, timeZone?: string): string {
  const key = `${locale}:${timeZone ?? ''}`;
  let formatter = dateTimeFormatters.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(intlLocale[locale], {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone,
    });
    dateTimeFormatters.set(key, formatter);
  }
  return formatter.format(typeof value === 'string' ? new Date(value) : value);
}
