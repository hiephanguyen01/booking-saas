import type { AvailabilityResponse, HourlySlot } from '@booking/contracts';
import { useMemo, useState } from 'react';
import {
  atomicHourlySlots,
  contiguousSlotsForInterval,
  slotInterval,
  toggleContiguousSlot,
} from '../../features/listing-group/listing-group-utils';
import { NsI18n, useTranslation } from '../../lib/i18n';
import { dateLabelInTz, dateOnlyToLocal, localToDateOnly, timeInTz } from '../../lib/time';
import { useLocale } from '../../lib/use-locale';
import type { SetSearchParams } from './booking-panel-types';

export function useBookingPanelHourlyPickerController({
  availability,
  fixedPackage,
  selectedEnd,
  selectedStart,
  setSp,
  sp,
  today,
  tz,
}: {
  availability: AvailabilityResponse | null;
  fixedPackage: boolean;
  selectedEnd: string | null;
  selectedStart: string | null;
  setSp: SetSearchParams;
  sp: URLSearchParams;
  today: string;
  tz: string;
}) {
  const { t } = useTranslation(NsI18n.Listing);
  const locale = useLocale();
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

  function clearSelection(): void {
    const next = new URLSearchParams(sp);
    next.delete('startTime');
    next.delete('endTime');
    next.delete('start');
    next.delete('end');
    setSelectionError('');
    setSp(next, { preventScrollReset: true });
  }

  return {
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
    slotsHaveUnavailable: slots.some((slot) => !slot.available),
    visibleSlots,
  };
}
