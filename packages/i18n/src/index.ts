import './i18next-types';

export {
  createBookingI18n,
  defaultLocale,
  defaultNS,
  en,
  flattenTranslationKeys,
  getServerTranslator,
  isLocale,
  namespaces,
  resources,
  supportedLocales,
  vi,
} from './create-i18n';
export type { Locale, Messages, Namespace } from './create-i18n';
export { formatCurrency, formatDate, formatDateTime } from './format';
export {
  BookingI18nProvider,
  createTranslator,
  I18nProvider,
  useTranslation,
} from './i18n-provider';
export type { I18n, NamespaceTranslationKey, ScopedI18n, TranslationKey } from './i18n-provider';
export { NsI18n } from './ns-i18n';
