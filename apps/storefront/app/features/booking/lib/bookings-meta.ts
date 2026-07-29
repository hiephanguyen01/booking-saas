import { type Locale } from '@booking/i18n';
import { localeTranslator } from '~/lib/translator';

export function buildBookingsMeta(locale: Locale) {
  return [
    { title: localeTranslator(locale).t('booking.lookup.metaTitle') },
    { name: 'robots', content: 'noindex' },
  ];
}
