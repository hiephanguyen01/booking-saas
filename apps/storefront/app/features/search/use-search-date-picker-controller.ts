import { useEffect, useMemo, useState } from 'react';
import type { Locale } from '~/lib/i18n';
import { dateLabelInTz, dateOnlyToLocal, DEFAULT_TZ, localToDateOnly, todayInTz } from '~/lib/time';
import type { DateRange } from './search-form-types';
import type { SearchMode } from './search-state';

export function useSearchDatePickerController({
  mode,
  date,
  setDate,
  range,
  setRange,
  singleDate,
  locale,
  pickDateLabel,
  endDateLabel,
}: {
  mode: SearchMode;
  date: string;
  setDate: (value: string) => void;
  range: DateRange;
  setRange: (value: DateRange) => void;
  singleDate: boolean;
  locale: Locale;
  pickDateLabel: string;
  endDateLabel: string;
}) {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [calendarToday, setCalendarToday] = useState<Date>();

  useEffect(() => {
    const update = (): void => {
      const today = todayInTz(DEFAULT_TZ);
      setCalendarToday((current) =>
        current && localToDateOnly(current) === today ? current : dateOnlyToLocal(today),
      );
    };

    update();
    const timer = window.setInterval(update, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const formatters = useMemo(() => {
    const tag = locale === 'en' ? 'en-GB' : 'vi-VN';
    const caption = new Intl.DateTimeFormat(tag, { month: 'long', year: 'numeric' });
    const weekday = new Intl.DateTimeFormat(tag, { weekday: 'short' });
    return {
      formatCaption: (month: Date) => caption.format(month),
      formatWeekdayName: (day: Date) => weekday.format(day),
    };
  }, [locale]);

  const singleMode = mode === 'hourly' || singleDate;
  const selectedDate = date ? dateOnlyToLocal(date) : undefined;
  const formatDay = (value: Date): string =>
    dateLabelInTz(localToDateOnly(value), DEFAULT_TZ, locale);
  const isSingleDayRange =
    range.from && range.to ? localToDateOnly(range.from) === localToDateOnly(range.to) : false;
  const label = singleMode
    ? date
      ? dateLabelInTz(date, DEFAULT_TZ, locale)
      : pickDateLabel
    : range.from
      ? isSingleDayRange
        ? formatDay(range.from)
        : `${formatDay(range.from)} - ${range.to ? formatDay(range.to) : endDateLabel}`
      : pickDateLabel;

  function selectSingleDate(next: Date | undefined, close: () => void): void {
    if (!next) return;
    setDate(localToDateOnly(next));
    close();
  }

  function selectDateRange(next: DateRange | undefined, close: () => void): void {
    const selected = next ?? { from: undefined };
    setRange(selected);
    if (selected.from && selected.to) close();
  }

  return {
    calendarToday,
    drawerOpen,
    formatters,
    label,
    popoverOpen,
    selectDateRange,
    selectSingleDate,
    selectedDate,
    setDrawerOpen,
    setPopoverOpen,
    singleMode,
  };
}
