import type { Locale } from '@booking/i18n';
import { useParams } from 'react-router';
import { localeParam } from '~/constants/paths';

export function useLocale(): Locale {
  const value = useParams().locale;
  return localeParam(value);
}
