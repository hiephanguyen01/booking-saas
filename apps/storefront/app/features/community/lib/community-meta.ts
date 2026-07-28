import { createTranslator, type Locale } from '@booking/i18n';

export function buildCommunityMeta(locale: Locale) {
  return [{ title: createTranslator(locale).t('account.community.metaTitle') }];
}
