import type {
  AvailabilityResponse,
  DayAvailability,
  PublicListingDetailResponse,
} from '@booking/contracts';
import { useMemo, useState } from 'react';
import { eligibleDailyRange, normalizeDailyRange } from '../../lib/daily-range';
import { NsI18n, useTranslation } from '../../lib/i18n';
import {
  addDays,
  dateLabelInTz,
  dateOnlyToLocal,
  localToDateOnly,
  zonedToUtcIso,
} from '../../lib/time';
import { useLocale } from '../../lib/use-locale';
import type { SetSearchParams } from './booking-panel-types';

export type BookingPanelDateRange = { from: Date | undefined; to?: Date | undefined };

export function useFixedDailyPickerController({
  availability,
  durationDays,
  listing,
  setSp,
  sp,
  tz,
}: {
  availability: AvailabilityResponse | null;
  durationDays: number;
  listing: PublicListingDetailResponse;
  setSp: SetSearchParams;
  sp: URLSearchParams;
  tz: string;
}) {
  const locale = useLocale();
  const [calendarOpen, setCalendarOpen] = useState(false);
  const days: DayAvailability[] = availability?.mode === 'daily' ? availability.days : [];
  const openDates = useMemo(
    () => new Set(days.filter((day) => day.status === 'available').map((day) => day.date)),
    [days],
  );
  const config = (listing.modeConfig.daily ?? {}) as {
    checkinTime?: string;
    checkoutTime?: string;
  };
  const selectedDateValue = sp.get('from');
  const calendarFormatters = useCalendarFormatters(locale);

  function selectDate(date: Date | undefined): void {
    if (!date) return;
    const from = localToDateOnly(date);
    const to = addDays(from, durationDays);
    const next = new URLSearchParams(sp);
    next.set('mode', 'daily');
    next.set('from', from);
    next.set('to', to);
    next.set('start', zonedToUtcIso(from, config.checkinTime ?? '14:00', tz));
    next.set('end', zonedToUtcIso(to, config.checkoutTime ?? '12:00', tz));
    setCalendarOpen(false);
    setSp(next, { preventScrollReset: true });
  }

  return {
    calendarFormatters,
    calendarOpen,
    isDateDisabled: (date: Date) => !openDates.has(localToDateOnly(date)),
    selectDate,
    selectedDate: selectedDateValue ? dateOnlyToLocal(selectedDateValue) : undefined,
    selectedDateLabel: selectedDateValue
      ? dateLabelInTz(selectedDateValue, tz, locale)
      : null,
    setCalendarOpen,
  };
}

export function useDailyPickerController({
  availability,
  listing,
  setSp,
  sp,
  tz,
}: {
  availability: AvailabilityResponse | null;
  listing: PublicListingDetailResponse;
  setSp: SetSearchParams;
  sp: URLSearchParams;
  tz: string;
}) {
  const { t } = useTranslation(NsI18n.Listing);
  const locale = useLocale();
  const [calendarOpen, setCalendarOpen] = useState(false);
  const calendarFormatters = useCalendarFormatters(locale);
  const days: DayAvailability[] = availability?.mode === 'daily' ? availability.days : [];
  const dailyConfig = (listing.modeConfig.daily ?? {}) as {
    checkinTime?: string;
    checkoutTime?: string;
    minNights?: number;
    maxNights?: number;
  };
  const checkinTime = dailyConfig.checkinTime ?? '14:00';
  const checkoutTime = dailyConfig.checkoutTime ?? '12:00';
  const minNights = dailyConfig.minNights ?? 1;
  const maxNights = Number.isFinite(Number(dailyConfig.maxNights))
    ? Number(dailyConfig.maxNights)
    : null;
  const openDates = useMemo(
    () => new Set(days.filter((day) => day.status === 'available').map((day) => day.date)),
    [days],
  );
  const fromDate = sp.get('from');
  const toDate = sp.get('to');
  const range: BookingPanelDateRange | undefined = fromDate
    ? { from: dateOnlyToLocal(fromDate), to: toDate ? dateOnlyToLocal(toDate) : undefined }
    : undefined;
  const formatDate = (value: string): string => dateLabelInTz(value, tz, locale);
  const selectedDateLabel = fromDate
    ? toDate
      ? fromDate === toDate
        ? formatDate(fromDate)
        : `${formatDate(fromDate)} - ${formatDate(toDate)}`
      : `${formatDate(fromDate)} - ${t('selectRange')}`
    : t('pickDates');
  const calendarMonth = range?.from ?? (days[0] ? dateOnlyToLocal(days[0].date) : undefined);
  const normalized = normalizeDailyRange(fromDate ?? undefined, toDate ?? undefined);

  function selectRange(next: BookingPanelDateRange | undefined): void {
    const params = new URLSearchParams(sp);
    params.set('mode', 'daily');
    if (!next?.from) {
      params.delete('from');
      params.delete('to');
      params.delete('start');
      params.delete('end');
      setSp(params, { preventScrollReset: true });
      return;
    }
    const fromStr = localToDateOnly(next.from);
    params.set('from', fromStr);

    if (next.to) {
      const selectedTo = localToDateOnly(next.to);
      params.set('to', selectedTo);
      const bookable = eligibleDailyRange(fromStr, selectedTo, minNights, maxNights);
      if (bookable) {
        params.set('start', zonedToUtcIso(bookable.from, checkinTime, tz));
        params.set('end', zonedToUtcIso(bookable.to, checkoutTime, tz));
      } else {
        params.delete('start');
        params.delete('end');
      }
    } else {
      params.delete('to');
      params.delete('start');
      params.delete('end');
    }
    setSp(params, { preventScrollReset: true });
    if (next.from && next.to) setCalendarOpen(false);
  }

  return {
    calendarFormatters,
    calendarMonth,
    calendarOpen,
    isDateDisabled: (date: Date) => !openDates.has(localToDateOnly(date)),
    minNights,
    nights: normalized?.nights ?? 0,
    range,
    selectRange,
    selectedDateLabel,
    setCalendarOpen,
  };
}

function useCalendarFormatters(locale: 'vi' | 'en') {
  return useMemo(() => {
    const tag = locale === 'en' ? 'en-GB' : 'vi-VN';
    const caption = new Intl.DateTimeFormat(tag, { month: 'long', year: 'numeric' });
    const weekday = new Intl.DateTimeFormat(tag, { weekday: 'short' });
    return {
      formatCaption: (month: Date) => caption.format(month),
      formatWeekdayName: (date: Date) => weekday.format(date),
    };
  }, [locale]);
}
