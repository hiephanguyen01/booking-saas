import type { Locale } from '@booking/i18n';
import { storefrontPaths } from '~/constants/paths';

const SEARCH_CONTEXT_FIELDS = [
  'q',
  'location',
  'mode',
  'date',
  'startTime',
  'endTime',
  'from',
  'to',
  'guests',
  'quantity',
] as const;

/** Returns from detail to the originating category without carrying booking-only params. */
export function catalogReturnHref(
  locale: Locale,
  typeSlug: string,
  current: URLSearchParams,
): string {
  const next = new URLSearchParams();
  for (const field of SEARCH_CONTEXT_FIELDS) {
    for (const value of current.getAll(field)) {
      if (value.trim()) next.append(field, value);
    }
  }
  const path = storefrontPaths.catalog(locale, typeSlug);
  return next.size ? `${path}?${next.toString()}` : path;
}
