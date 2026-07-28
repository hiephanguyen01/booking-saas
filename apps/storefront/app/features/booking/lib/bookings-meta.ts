import { createTranslator, type Locale } from '@booking/i18n';

export function buildBookingsMeta(locale: Locale) {
  return [
    { title: createTranslator(locale).t('booking.lookup.metaTitle') },
    { name: 'robots', content: 'noindex' },
  ];
}
