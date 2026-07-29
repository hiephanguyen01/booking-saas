import { isLocale, type TranslationKey } from '@booking/i18n';
import { localeTranslator } from '~/lib/translator';

const META_TITLE_KEYS = {
  start: 'auth.partner.meta.start',
  verify: 'auth.partner.meta.verify',
  password: 'auth.partner.meta.password',
  profile: 'auth.partner.meta.profile',
  done: 'auth.partner.meta.done',
  affiliate: 'auth.affiliate.meta',
} as const satisfies Record<string, TranslationKey>;

type OnboardingMetaStep = keyof typeof META_TITLE_KEYS;

/**
 * Meta tags for an onboarding step.
 *
 * The storefront is white-label — one deployment serves every tenant, resolved
 * from the `Host` header — so the title must carry the resolved tenant's name.
 * `tenantName` comes from the root match, which is the only loader that resolves it.
 */
export function partnerMeta(
  tenantName: string | undefined,
  locale: string | undefined,
  step: OnboardingMetaStep,
): Array<Record<string, string>> {
  const { t } = localeTranslator(isLocale(locale) ? locale : 'vi');
  const title = t(META_TITLE_KEYS[step]);
  return [
    { title: tenantName ? `${title} · ${tenantName}` : title },
    { name: 'robots', content: 'noindex,nofollow' },
  ];
}
