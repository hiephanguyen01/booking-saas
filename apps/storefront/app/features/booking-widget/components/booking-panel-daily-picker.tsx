import type { AvailabilityResponse, PublicListingDetailResponse } from '@booking/contracts';
import { Button } from '@booking/ui/components/ui/button';
import { Calendar } from '@booking/ui/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@booking/ui/components/ui/popover';
import { CalendarDays, ChevronDown } from 'lucide-react';
import { NsI18n, useTranslation } from '@booking/i18n';
import { PickerLabel } from './booking-panel-presentation';
import type { SetSearchParams } from '~/features/booking-widget/lib/booking-panel-types';
import {
  useDailyPickerController,
  useFixedDailyPickerController,
} from '~/features/booking-widget/hooks/use-booking-panel-daily-picker-controller';
import { SalePrice } from '~/components/sale-price';
import { dailyAvailabilityInRange, type PricedDayAvailability } from '~/lib/availability';
import { discountPercent } from '~/lib/sale-campaign';
import { addDays, dateLabelInTz, localToDateOnly } from '~/lib/time';
import { useLocale } from '~/hooks/use-locale';

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
  const selectedFrom = selectedDate ? localToDateOnly(selectedDate) : null;
  const priceHints = discountedDailyPriceHints(
    availability,
    selectedFrom,
    selectedFrom ? addDays(selectedFrom, durationDays) : null,
  );

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
      <DailyPriceHints hints={priceHints} timezone={tz} />
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
  const hintFrom = range?.from ? localToDateOnly(range.from) : null;
  const priceHints = discountedDailyPriceHints(
    availability,
    hintFrom,
    range?.to ? localToDateOnly(range.to) : hintFrom ? addDays(hintFrom, 1) : null,
  );

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
      <DailyPriceHints hints={priceHints} timezone={tz} />
    </div>
  );
}

function discountedDailyPriceHints(
  availability: AvailabilityResponse | null,
  from: string | null,
  to: string | null,
): PricedDayAvailability[] {
  return dailyAvailabilityInRange(availability, from, to).filter(
    (day) => discountPercent(day.regularPrice, day.price) !== null,
  );
}

function DailyPriceHints({
  hints,
  timezone,
}: {
  hints: PricedDayAvailability[];
  timezone: string;
}) {
  const { t } = useTranslation(NsI18n.Listing);
  const locale = useLocale();
  if (!hints.length) return null;

  return (
    <div className="rounded-md border border-warning/30 bg-warning/5 p-3">
      <p className="text-xs font-semibold text-warning-foreground">
        {t('campaign.calendarSaleHeading')}
      </p>
      <ul className="mt-2 max-h-32 space-y-2 overflow-y-auto">
        {hints.map((day) => (
          <li
            key={day.date}
            className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-xs"
          >
            <span className="text-muted-foreground">
              {dateLabelInTz(day.date, timezone, locale)}
            </span>
            <SalePrice
              price={day.price}
              regularPrice={day.regularPrice}
              campaignLabel={day.campaignLabel}
              compact
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
