import type {
  AvailabilityResponse,
  DayAvailability,
  PublicListingDetailResponse,
} from '@booking/contracts';
import { Button } from '@booking/ui/components/ui/button';
import { Calendar } from '@booking/ui/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@booking/ui/components/ui/popover';
import { CalendarDays, ChevronDown } from 'lucide-react';
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
import { PickerLabel } from './booking-panel-presentation';
import type { SetSearchParams } from './booking-panel-types';

/** Local mirror of react-day-picker's DateRange (not a direct storefront dep). */
type DateRange = { from: Date | undefined; to?: Date | undefined };

export function FixedDailyPicker({
  availability,
  listing,
  sp,
  setSp,
  tz,
  durationDays,
}: {
  availability: AvailabilityResponse | null;
  listing: PublicListingDetailResponse;
  sp: URLSearchParams;
  setSp: SetSearchParams;
  tz: string;
  durationDays: number;
}) {
  const { t } = useTranslation(NsI18n.Listing);
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
  const selectedDate = sp.get('from');
  const formatters = useMemo(() => {
    const tag = locale === 'en' ? 'en-GB' : 'vi-VN';
    const caption = new Intl.DateTimeFormat(tag, { month: 'long', year: 'numeric' });
    const weekday = new Intl.DateTimeFormat(tag, { weekday: 'short' });
    return {
      formatCaption: (month: Date) => caption.format(month),
      formatWeekdayName: (date: Date) => weekday.format(date),
    };
  }, [locale]);

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

  return (
    <div className="space-y-2">
      <PickerLabel>{t('pickDay')}</PickerLabel>
      <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" className="w-full justify-start">
            <CalendarDays className="size-4" />
            {selectedDate ? dateLabelInTz(selectedDate, tz, locale) : t('pickDay')}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto p-0">
          <Calendar
            mode="single"
            selected={selectedDate ? dateOnlyToLocal(selectedDate) : undefined}
            onSelect={selectDate}
            disabled={(date) => !openDates.has(localToDateOnly(date))}
            formatters={formatters}
          />
        </PopoverContent>
      </Popover>
      <p className="text-xs text-muted-foreground">Thời gian của gói: {durationDays} ngày.</p>
    </div>
  );
}

export function DailyPicker({
  availability,
  listing,
  sp,
  setSp,
  tz,
}: {
  availability: AvailabilityResponse | null;
  listing: PublicListingDetailResponse;
  sp: URLSearchParams;
  setSp: SetSearchParams;
  tz: string;
}) {
  const { t } = useTranslation(NsI18n.Listing);
  const locale = useLocale();
  const [calendarOpen, setCalendarOpen] = useState(false);
  const calendarFormatters = useMemo(() => {
    const tag = locale === 'en' ? 'en-GB' : 'vi-VN';
    const caption = new Intl.DateTimeFormat(tag, { month: 'long', year: 'numeric' });
    const weekday = new Intl.DateTimeFormat(tag, { weekday: 'short' });
    return {
      formatCaption: (month: Date) => caption.format(month),
      formatWeekdayName: (date: Date) => weekday.format(date),
    };
  }, [locale]);
  const days: DayAvailability[] = availability?.mode === 'daily' ? availability.days : [];
  const dailyCfg = (listing.modeConfig.daily ?? {}) as {
    checkinTime?: string;
    checkoutTime?: string;
    minNights?: number;
    maxNights?: number;
  };
  const checkinTime = dailyCfg.checkinTime ?? '14:00';
  const checkoutTime = dailyCfg.checkoutTime ?? '12:00';
  const minNights = dailyCfg.minNights ?? 1;
  const maxNights = Number.isFinite(Number(dailyCfg.maxNights)) ? Number(dailyCfg.maxNights) : null;

  const openDates = useMemo(
    () => new Set(days.filter((day) => day.status === 'available').map((day) => day.date)),
    [days],
  );

  const fromDate = sp.get('from');
  const toDate = sp.get('to');
  const range: DateRange | undefined = fromDate
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

  function onSelect(next: DateRange | undefined): void {
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
  }

  function isDisabled(date: Date): boolean {
    return !openDates.has(localToDateOnly(date));
  }

  const normalized = normalizeDailyRange(fromDate ?? undefined, toDate ?? undefined);
  const nights = normalized?.nights ?? 0;

  return (
    <div className="space-y-2">
      <PickerLabel>{t('pickDates')}</PickerLabel>
      <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className="h-11 w-full justify-start gap-2 px-3 text-left font-normal"
            aria-label={`${t('pickDates')}: ${selectedDateLabel}`}
          >
            <CalendarDays className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate">{selectedDateLabel}</span>
            <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          sideOffset={8}
          className="w-auto max-w-[calc(100vw-2rem)] p-0"
        >
          <div className="overflow-x-auto p-2">
            <Calendar
              mode="range"
              selected={range}
              onSelect={(next) => {
                onSelect(next);
                if (next?.from && next.to) setCalendarOpen(false);
              }}
              disabled={isDisabled}
              excludeDisabled
              defaultMonth={calendarMonth}
              resetOnSelect
              formatters={calendarFormatters}
              className="sf-calendar w-full [--cell-size:2.25rem]"
            />
          </div>
        </PopoverContent>
      </Popover>
      {nights > 0 ? (
        <p className="text-sm text-muted-foreground">
          {t('nights', { count: nights })}
          {nights < minNights ? ` · ${t('minNights', { count: minNights })}` : ''}
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">{t('selectRange')}</p>
      )}
    </div>
  );
}
