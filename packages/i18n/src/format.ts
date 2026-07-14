import type { Locale } from './instance';

const intlLocale: Record<Locale, string> = { vi: 'vi-VN', en: 'en-US' };

export function formatCurrency(value: number, currency: string, locale: Locale): string {
  return new Intl.NumberFormat(intlLocale[locale], {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatDate(value: string | Date, locale: Locale, timeZone?: string): string {
  return new Intl.DateTimeFormat(intlLocale[locale], {
    dateStyle: 'medium',
    timeZone,
  }).format(typeof value === 'string' ? new Date(value) : value);
}

export function formatDateTime(
  value: string | Date,
  locale: Locale,
  timeZone?: string,
): string {
  return new Intl.DateTimeFormat(intlLocale[locale], {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone,
  }).format(typeof value === 'string' ? new Date(value) : value);
}
