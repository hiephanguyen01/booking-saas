import { type Locale } from '@booking/i18n';
import { localeTranslator } from '~/lib/translator';

export function buildCommunityMeta(locale: Locale) {
  return [{ title: localeTranslator(locale).t('account.community.metaTitle') }];
}
