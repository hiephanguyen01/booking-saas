import type { Locale } from '@booking/i18n';
import type { StorefrontSearchState } from './search-state';

export interface SearchScheduleSummary {
  primary: string;
  secondary: string;
}

export interface SearchScheduleLabels {
  chooseSchedule: string;
  pickHours: string;
  hourly: string;
  daily: string;
  inventory: string;
}

type SearchScheduleState = Pick<
  StorefrontSearchState,
  | 'mode'
  | 'date'
  | 'from'
  | 'to'
  | 'startTime'
  | 'endTime'
  | 'hasDateSelection'
  | 'hasTimeSelection'
  | 'hasDailyRange'
>;

const dateFormatters = new Map<Locale, Intl.DateTimeFormat>();

/**
 * Formats the compact, human-readable schedule shown above a listing group.
 * Date-only values are constructed and read in UTC so the server and browser
 * cannot shift them into adjacent calendar days.
 */
export function formatSearchScheduleSummary(
  state: SearchScheduleState,
  locale: Locale,
  labels: SearchScheduleLabels,
): SearchScheduleSummary {
  if (state.mode === 'hourly') {
    if (!state.hasDateSelection) {
      return { primary: labels.chooseSchedule, secondary: labels.hourly };
    }

    return {
      primary: formatFullDate(state.date, locale),
      secondary: state.hasTimeSelection ? `${state.startTime}–${state.endTime}` : labels.pickHours,
    };
  }

  if (state.mode === 'daily' || state.mode === 'inventory') {
    const modeLabel = state.mode === 'inventory' ? labels.inventory : labels.daily;
    if (!state.hasDailyRange) {
      return { primary: labels.chooseSchedule, secondary: modeLabel };
    }

    return {
      primary: formatFullDate(state.from, locale),
      secondary: `→ ${formatFullDate(state.to, locale)}`,
    };
  }

  return { primary: labels.chooseSchedule, secondary: labels.hourly };
}

function formatFullDate(value: string, locale: Locale): string {
  let formatter = dateFormatters.get(locale);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale === 'vi' ? 'vi-VN' : 'en-US', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    });
    dateFormatters.set(locale, formatter);
  }

  const [year, month, day] = value.split('-').map(Number);
  return formatter.format(new Date(Date.UTC(year, month - 1, day, 12)));
}
