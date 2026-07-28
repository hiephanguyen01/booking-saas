import type { NsI18n, useTranslation } from '~/lib/i18n';
import type { SearchMode } from './search-state';

type Translate = ReturnType<typeof useTranslation<typeof NsI18n.Common>>['t'];

export function modeHint(mode: SearchMode, t: Translate): string {
  if (mode === 'hourly') return t('home.bookHourlyHint');
  if (mode === 'inventory') return t('home.inventoryHint');
  return t('home.bookDailyHint');
}
