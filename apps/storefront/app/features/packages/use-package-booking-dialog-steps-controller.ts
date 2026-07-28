import type { HourlySlot } from '@booking/contracts';
import { useMemo } from 'react';
import { NsI18n, useTranslation } from '~/lib/i18n';
import { DEFAULT_TZ, dateLabelInTz, dateOnlyToLocal, localToDateOnly } from '~/lib/time';
import { formatVnd } from '~/lib/ui';
import { useLocale } from '~/hooks/use-locale';

export function usePackageBookingDialogStepsController({
  date,
  timezone,
  today,
  slots,
  selectedSlots,
  onSelectDate,
}: {
  date: string | null;
  timezone: string;
  today: string;
  slots: HourlySlot[];
  selectedSlots: HourlySlot[];
  onSelectDate: (date: string) => void;
}) {
  const { t } = useTranslation([NsI18n.Listing, NsI18n.Common]);
  const locale = useLocale();
  const todayDate = dateOnlyToLocal(today);
  const timeFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'vi-VN', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: timezone,
      }),
    [locale, timezone],
  );
  const calendarA11y = useMemo(() => {
    const tag = locale === 'en' ? 'en-GB' : 'vi-VN';
    const caption = new Intl.DateTimeFormat(tag, { month: 'long', year: 'numeric' });
    const fullDate = new Intl.DateTimeFormat(tag, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    return {
      formatters: {
        formatCaption: (month: Date) => caption.format(month),
        formatWeekdayName: (day: Date) =>
          locale === 'en'
            ? new Intl.DateTimeFormat(tag, { weekday: 'narrow' }).format(day)
            : ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][day.getDay()],
      },
      labels: {
        labelDayButton: (day: Date) => fullDate.format(day),
        labelGrid: (month?: Date) =>
          t('group.calendarLabel', { month: month ? caption.format(month) : '' }),
        labelNav: () => t('group.calendarNavigation'),
        labelPrevious: () => t('group.previousMonth'),
        labelNext: () => t('group.nextMonth'),
      },
    };
  }, [locale, t]);
  const selectedSlotKeys = useMemo(
    () => new Set(selectedSlots.map((slot) => `${slot.startUtc}:${slot.endUtc}`)),
    [selectedSlots],
  );
  const slotModels = useMemo(
    () =>
      slots.map((slot) => ({
        key: `${slot.startUtc}:${slot.endUtc}`,
        slot,
        selected: selectedSlotKeys.has(`${slot.startUtc}:${slot.endUtc}`),
        startLabel: timeFormatter.format(new Date(slot.startUtc)),
        endLabel: timeFormatter.format(new Date(slot.endUtc)),
        priceLabel: slot.available ? formatVnd(slot.price) : t('group.unavailableSlot'),
      })),
    [selectedSlotKeys, slots, t, timeFormatter],
  );

  function selectCalendarDay(day: Date | undefined): void {
    if (day) onSelectDate(localToDateOnly(day));
  }

  return {
    calendarA11y,
    dateInstruction: date
      ? `${dateLabelInTz(date, DEFAULT_TZ, locale)} · ${t('packages.hourlyInstruction')}`
      : null,
    selectCalendarDay,
    slotModels,
    todayDate,
  };
}
