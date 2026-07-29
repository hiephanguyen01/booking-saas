import type { Locale } from '@booking/i18n';
import { useMemo } from 'react';
import { intlLocale } from '~/lib/intl';

export interface CalendarFormatters {
  formatCaption: (month: Date) => string;
  formatWeekdayName: (day: Date) => string;
}

/**
 * `short` is the default day-picker header (`CN`, `Th 2`, … from `Intl`).
 * `narrow` is for the cramped booking-dialog calendar: English falls back to the
 * one-letter `Intl` narrow form, Vietnamese to `CN`/`T2`…`T7`, because `vi-VN`'s
 * own narrow form is not distinguishable.
 */
export type CalendarWeekdayStyle = 'short' | 'narrow';

const VI_NARROW_WEEKDAYS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

/**
 * `formatters` for `@booking/ui`'s `Calendar`. Memoized per locale so the
 * `Intl.DateTimeFormat` instances — which are expensive to construct — are built once
 * per picker rather than once per rendered cell.
 */
export function useCalendarFormatters(
  locale: Locale,
  weekdayStyle: CalendarWeekdayStyle = 'short',
): CalendarFormatters {
  return useMemo(() => {
    const tag = intlLocale(locale);
    const caption = new Intl.DateTimeFormat(tag, { month: 'long', year: 'numeric' });
    const weekday = new Intl.DateTimeFormat(tag, { weekday: weekdayStyle });
    const useViNarrow = weekdayStyle === 'narrow' && locale !== 'en';

    return {
      formatCaption: (month: Date) => caption.format(month),
      formatWeekdayName: (day: Date) =>
        useViNarrow ? (VI_NARROW_WEEKDAYS[day.getDay()] ?? '') : weekday.format(day),
    };
  }, [locale, weekdayStyle]);
}
