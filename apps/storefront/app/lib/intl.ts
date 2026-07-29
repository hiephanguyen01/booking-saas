/**
 * BCP-47 tags for `Intl.*`.
 *
 * The app locale is `vi` | `en` (see `@booking/i18n`), but `Intl` needs a region to
 * pick date order, separators and relative-time wording — so every formatter in the
 * storefront had to widen the locale itself. That mapping was inlined at ~20 call
 * sites, which is why it drifted: most surfaces widen `en` to `en-GB`, a handful to
 * `en-US`.
 *
 * `en-GB` is the default because it is day-first like the `vi-VN` output it sits
 * beside — a booking that reads `20/07/2026` in Vietnamese must not read `7/20/2026`
 * in English. Surfaces that deliberately (or historically) render month-first pass
 * `'en-US'` explicitly, so the exception is visible instead of silent.
 */
export type IntlTag = 'vi-VN' | 'en-GB' | 'en-US';

export function intlLocale(locale: string, enTag: 'en-GB' | 'en-US' = 'en-GB'): IntlTag {
  return locale === 'en' ? enTag : 'vi-VN';
}
