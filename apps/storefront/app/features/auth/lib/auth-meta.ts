import { isLocale, type TranslationKey } from '@booking/i18n';
import { localeTranslator } from '~/lib/translator';

const META_TITLE_KEYS = {
  login: 'auth.meta.login',
  register: 'auth.meta.register',
  registerVerify: 'auth.meta.registerVerify',
  registerPassword: 'auth.meta.registerPassword',
  registerSuccess: 'auth.meta.registerSuccess',
  forgotPassword: 'auth.meta.forgotPassword',
  forgotPasswordVerify: 'auth.meta.forgotPasswordVerify',
  forgotPasswordNewPassword: 'auth.meta.forgotPasswordNewPassword',
  forgotPasswordSuccess: 'auth.meta.forgotPasswordSuccess',
} as const satisfies Record<string, TranslationKey>;

export type AuthMetaStep = keyof typeof META_TITLE_KEYS;

/**
 * Meta tags for a customer auth step.
 *
 * The nine auth routes each carried their own `params.locale === 'en' ? … : …`
 * ternary, which put eighteen user-facing strings outside `@booking/i18n` — and
 * one of them had already drifted to English-only. Modelled on `partnerMeta`.
 */
export function authMeta(
  locale: string | undefined,
  step: AuthMetaStep,
): Array<Record<string, string>> {
  const { t } = localeTranslator(isLocale(locale) ? locale : 'vi');
  return [{ title: t(META_TITLE_KEYS[step]) }, { name: 'robots', content: 'noindex,nofollow' }];
}
