import type { AvailabilityResponse, HourlySlot } from '@booking/contracts';
import { Button } from '@booking/ui/components/ui/button';
import { Calendar } from '@booking/ui/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@booking/ui/components/ui/popover';
import { ToggleGroup, ToggleGroupItem } from '@booking/ui/components/ui/toggle-group';
import { CalendarDays, ChevronDown } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  atomicHourlySlots,
  contiguousSlotsForInterval,
  slotInterval,
  toggleContiguousSlot,
} from '../../features/listing-group/listing-group-utils';
import { NsI18n, useTranslation } from '../../lib/i18n';
import {
  dateLabelInTz,
  dateOnlyToLocal,
  localToDateOnly,
  timeInTz,
  todayInTz,
} from '../../lib/time';
import { formatVnd } from '../../lib/ui';
import { useLocale } from '../../lib/use-locale';
import { PickerLabel } from './booking-panel-presentation';
import type { SetSearchParams } from './booking-panel-types';

export function HourlyPicker({
  availability,
  sp,
  setSp,
  tz,
  selectedStart,
  selectedEnd,
  fixedPackage,
}: {
  availability: AvailabilityResponse | null;
  sp: URLSearchParams;
  setSp: SetSearchParams;
  tz: string;
  selectedStart: string | null;
  selectedEnd: string | null;
  fixedPackage: boolean;
}) {
  const { t } = useTranslation(NsI18n.Listing);
  const locale = useLocale();
  const today = todayInTz(tz);
  const selectedDayValue = sp.get('day') || sp.get('date');
  const availabilityDay = selectedDayValue ?? today;
  const durationSlots: HourlySlot[] =
    availability?.mode === 'hourly' ? (availability.days[0]?.slots ?? []) : [];
  const slots = useMemo(
    () => (fixedPackage ? durationSlots : atomicHourlySlots(durationSlots)),
    [durationSlots, fixedPackage],
  );
  const calendarFormatters = useMemo(() => {
    const tag = locale === 'en' ? 'en-GB' : 'vi-VN';
    const caption = new Intl.DateTimeFormat(tag, { month: 'long', year: 'numeric' });
    const weekday = new Intl.DateTimeFormat(tag, { weekday: 'short' });
    return {
      formatCaption: (month: Date) => caption.format(month),
      formatWeekdayName: (date: Date) => weekday.format(date),
    };
  }, [locale]);
  const selectedDay = selectedDayValue ? dateOnlyToLocal(selectedDayValue) : undefined;
  const calendarMonth = selectedDay ?? dateOnlyToLocal(availabilityDay);
  const formattedDay = selectedDayValue
    ? dateLabelInTz(selectedDayValue, tz, locale)
    : t('pickDay');
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [onlyAvailable, setOnlyAvailable] = useState(false);
  const [selectionError, setSelectionError] = useState('');
  const selected = useMemo(
    () =>
      selectedStart && selectedEnd
        ? fixedPackage
          ? slots.filter((slot) => slot.startUtc === selectedStart && slot.endUtc === selectedEnd)
          : contiguousSlotsForInterval(slots, selectedStart, selectedEnd)
        : [],
    [fixedPackage, selectedEnd, selectedStart, slots],
  );

  function pickDay(date: Date | undefined): void {
    if (!date) return;
    const nextDay = localToDateOnly(date);
    const next = new URLSearchParams(sp);
    next.set('mode', 'hourly');
    next.set('day', nextDay);
    next.set('date', nextDay);
    next.delete('start');
    next.delete('end');
    next.delete('startTime');
    next.delete('endTime');
    setSelectionError('');
    setCalendarOpen(false);
    setSp(next, { preventScrollReset: true });
  }

  function pickSlot(slot: HourlySlot): void {
    if (!slot.available || !selectedDayValue) return;
    if (fixedPackage) {
      const next = new URLSearchParams(sp);
      next.set('mode', 'hourly');
      next.set('day', selectedDayValue);
      next.set('date', selectedDayValue);
      if (selectedStart === slot.startUtc && selectedEnd === slot.endUtc) {
        next.delete('start');
        next.delete('end');
      } else {
        next.set('start', slot.startUtc);
        next.set('end', slot.endUtc);
      }
      setSelectionError('');
      setSp(next, { preventScrollReset: true });
      return;
    }

    const result = toggleContiguousSlot(selected, slot);
    if (!result.changed) {
      setSelectionError(t('group.contiguousOnly'));
      return;
    }

    const next = new URLSearchParams(sp);
    next.set('mode', 'hourly');
    next.set('day', selectedDayValue);
    next.set('date', selectedDayValue);
    const interval = slotInterval(result.slots);
    if (interval) {
      next.set('startTime', timeInTz(interval.start, tz));
      next.set('endTime', timeInTz(interval.end, tz));
      next.set('start', interval.start);
      next.set('end', interval.end);
    } else {
      next.delete('startTime');
      next.delete('endTime');
      next.delete('start');
      next.delete('end');
    }
    setSelectionError('');
    setSp(next, { preventScrollReset: true });
  }

  const available = slots.filter((slot) => slot.available);
  const visibleSlots = onlyAvailable ? available : slots;
  const selectedValues = selected.map((slot) => slot.startUtc);
  const selectedUnavailable = Boolean(
    selectedDayValue && selectedStart && selectedEnd && selected.length === 0,
  );

  function changeSelectedSlots(values: string[]): void {
    const changedValue = [...selectedValues, ...values].find(
      (value) => selectedValues.includes(value) !== values.includes(value),
    );
    const changedSlot = slots.find((slot) => slot.startUtc === changedValue);
    if (changedSlot) pickSlot(changedSlot);
  }

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
            {slots.some((slot) => !slot.available) ? (
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
          onClick={() => {
            const next = new URLSearchParams(sp);
            next.delete('startTime');
            next.delete('endTime');
            next.delete('start');
            next.delete('end');
            setSelectionError('');
            setSp(next, { preventScrollReset: true });
          }}
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
