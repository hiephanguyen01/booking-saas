import { createTranslator, type I18n, type Locale } from '@booking/i18n';

/**
 * `createTranslator` is not cheap: each call bootstraps a whole i18next instance
 * (`createInstance` + `init` over every namespace in both locales). That is fine
 * once per request, but several call sites sit inside a loop — one per booking in
 * the account list, one per failed backend call — where it costs a full bootstrap
 * per item.
 *
 * The instance is immutable once initialised (`lng` is fixed and nothing in the
 * app calls `changeLanguage`) and there are exactly two locales, so hand out one
 * translator per locale instead.
 */
const translators = new Map<Locale, I18n>();

export function localeTranslator(locale: Locale): I18n {
  const cached = translators.get(locale);
  if (cached) return cached;

  const translator = createTranslator(locale);
  translators.set(locale, translator);
  return translator;
}
