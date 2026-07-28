import type { Locale } from '@booking/i18n';
import { useParams } from 'react-router';

export function useLocale(): Locale {
  const value = useParams().locale;
  return value === 'en' ? 'en' : 'vi';
}
