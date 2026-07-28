import type { AvailabilityResponse, PublicListingDetailResponse } from '@booking/contracts';
import { Button } from '@booking/ui/components/ui/button';
import { Calendar } from '@booking/ui/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@booking/ui/components/ui/popover';
import { CalendarDays, ChevronDown } from 'lucide-react';
import { NsI18n, useTranslation } from '~/lib/i18n';
import { PickerLabel } from './booking-panel-presentation';
import type { SetSearchParams } from './booking-panel-types';
import {
  useDailyPickerController,
  useFixedDailyPickerController,
} from './use-booking-panel-daily-picker-controller';

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
  const {
    calendarFormatters,
    calendarOpen,
    isDateDisabled,
    selectDate,
    selectedDate,
    selectedDateLabel,
    setCalendarOpen,
  } = useFixedDailyPickerController({
    availability,
    durationDays,
    listing,
    setSp,
    sp,
    tz,
  });

  return (
    <div className="space-y-2">
      <PickerLabel>{t('pickDay')}</PickerLabel>
      <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" className="w-full justify-start">
            <CalendarDays className="size-4" />
            {selectedDateLabel ?? t('pickDay')}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto p-0">
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={selectDate}
            disabled={isDateDisabled}
            formatters={calendarFormatters}
          />
        </PopoverContent>
      </Popover>
      <p className="text-xs text-muted-foreground">
        {t('duration')}: {t('packages.durationDays', { count: durationDays })}.
      </p>
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
  const {
    calendarFormatters,
    calendarMonth,
    calendarOpen,
    isDateDisabled,
    minNights,
    nights,
    range,
    selectRange,
    selectedDateLabel,
    setCalendarOpen,
  } = useDailyPickerController({ availability, listing, setSp, sp, tz });

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
              onSelect={selectRange}
              disabled={isDateDisabled}
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
