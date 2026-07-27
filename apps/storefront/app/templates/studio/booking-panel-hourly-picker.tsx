import type { AvailabilityResponse } from '@booking/contracts';
import { Button } from '@booking/ui/components/ui/button';
import { Calendar } from '@booking/ui/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@booking/ui/components/ui/popover';
import { ToggleGroup, ToggleGroupItem } from '@booking/ui/components/ui/toggle-group';
import { CalendarDays, ChevronDown } from 'lucide-react';
import { NsI18n, useTranslation } from '../../lib/i18n';
import { dateOnlyToLocal, timeInTz } from '../../lib/time';
import { formatVnd } from '../../lib/ui';
import { PickerLabel } from './booking-panel-presentation';
import type { SetSearchParams } from './booking-panel-types';
import { useBookingPanelHourlyPickerController } from './use-booking-panel-hourly-picker-controller';

export function HourlyPicker({
  availability,
  sp,
  setSp,
  tz,
  today,
  selectedStart,
  selectedEnd,
  fixedPackage,
}: {
  availability: AvailabilityResponse | null;
  sp: URLSearchParams;
  setSp: SetSearchParams;
  tz: string;
  today: string;
  selectedStart: string | null;
  selectedEnd: string | null;
  fixedPackage: boolean;
}) {
  const { t } = useTranslation(NsI18n.Listing);
  const {
    calendarFormatters,
    calendarMonth,
    calendarOpen,
    changeSelectedSlots,
    clearSelection,
    formattedDay,
    onlyAvailable,
    pickDay,
    selected,
    selectedDay,
    selectedDayValue,
    selectedUnavailable,
    selectedValues,
    selectionError,
    setCalendarOpen,
    setOnlyAvailable,
    slotsHaveUnavailable,
    visibleSlots,
  } = useBookingPanelHourlyPickerController({
    availability,
    fixedPackage,
    selectedEnd,
    selectedStart,
    setSp,
    sp,
    today,
    tz,
  });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <PickerLabel>{t('pickDay')}</PickerLabel>
        <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              className="w-full justify-start"
              aria-label={selectedDayValue ? `${t('pickDay')}: ${formattedDay}` : t('pickDay')}
            >
              <CalendarDays data-icon="inline-start" />
              <span className="min-w-0 flex-1 truncate text-left">{formattedDay}</span>
              <ChevronDown data-icon="inline-end" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-auto p-0">
            <Calendar
              mode="single"
              selected={selectedDay}
              defaultMonth={calendarMonth}
              onSelect={pickDay}
              disabled={{ before: dateOnlyToLocal(today) }}
              formatters={calendarFormatters}
            />
          </PopoverContent>
        </Popover>
      </div>

      {!selectedDayValue ? (
        <p className="rounded-lg border border-dashed border-border py-6 text-center text-sm text-muted-foreground">
          {t('pickDayFirst')}
        </p>
      ) : (
        <>
          <div className="flex items-center justify-between gap-3">
            <div>
              <PickerLabel>{t('pickSlot')}</PickerLabel>
              {selected.length ? (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {t('group.slotsChosen', { count: selected.length })}
                </p>
              ) : null}
            </div>
            {slotsHaveUnavailable ? (
              <button
                type="button"
                onClick={() => setOnlyAvailable((current) => !current)}
                className="text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {onlyAvailable ? t('showAllSlots') : t('showOnlyAvailable')}
              </button>
            ) : null}
          </div>
          {visibleSlots.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border py-6 text-center text-sm text-muted-foreground">
              {t('noSlots')}
            </p>
          ) : (
            <ToggleGroup
              type="multiple"
              variant="outline"
              spacing={2}
              value={selectedValues}
              onValueChange={changeSelectedSlots}
              aria-label={t('pickSlot')}
              className="grid max-h-60 w-full grid-cols-2 gap-2 overflow-y-auto pr-1"
            >
              {visibleSlots.map((slot, slotIndex) => {
                const startTime = timeInTz(slot.startUtc, tz);
                const endTime = timeInTz(slot.endUtc, tz);
                const slotStatus = slot.available ? formatVnd(slot.price) : t('unavailableSlot');
                return (
                  <ToggleGroupItem
                    key={`${slot.startUtc}-${slot.endUtc}-${slotIndex}`}
                    value={slot.startUtc}
                    disabled={!slot.available}
                    aria-label={`${startTime}–${endTime}, ${slotStatus}`}
                    className="h-auto min-w-0 flex-col gap-0.5 px-1 py-2 whitespace-normal data-[state=on]:border-primary data-[state=on]:bg-primary/10 data-[state=on]:text-primary"
                  >
                    <span>
                      {startTime}–{endTime}
                    </span>
                    <span className="text-xs text-muted-foreground">{slotStatus}</span>
                  </ToggleGroupItem>
                );
              })}
            </ToggleGroup>
          )}
        </>
      )}
      {selected.length ? (
        <button
          type="button"
          onClick={clearSelection}
          className="text-left text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {t('group.clearAll')}
        </button>
      ) : null}
      {selectionError ? (
        <p role="alert" className="text-xs text-destructive">
          {selectionError}
        </p>
      ) : null}
      {selectedUnavailable ? (
        <p role="alert" className="text-xs text-destructive">
          {t('selectedSlotUnavailable')}
        </p>
      ) : null}
    </div>
  );
}
