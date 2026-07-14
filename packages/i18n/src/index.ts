import './i18next-types';

export {
  createBookingI18n,
  defaultLocale,
  defaultNS,
  en,
  flattenTranslationKeys,
  getServerTranslator,
  isLocale,
  resources,
  namespaces,
  supportedLocales,
  vi,
} from './create-i18n';
export type { Locale, Messages, Namespace } from './create-i18n';
export {
  BookingI18nProvider,
  createTranslator,
  I18nProvider,
  useT,
} from './i18n-provider';
export type { I18n, TranslationKey } from './i18n-provider';
export { formatCurrency, formatDate, formatDateTime } from './format';
