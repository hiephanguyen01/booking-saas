import type { AvailabilityResponse, HourlySlot } from '@booking/contracts';
import { useMemo } from 'react';
import { NsI18n, useTranslation } from '@booking/i18n';
import type { PublicPackageOption } from '~/lib/package-options';
import { DEFAULT_TZ, dateLabelInTz, dateOnlyToLocal, localToDateOnly } from '~/lib/time';
import { formatVnd } from '~/lib/ui';
import { useLocale } from '~/hooks/use-locale';

export function useBookingDialogStepsController({
  mode,
  packageOptions,
  packageId,
  selectedPackage,
  listingTitle,
  listingPhotos,
  date,
  today,
  from,
  to,
  availability,
  availabilityPending,
  slots,
  selectedSlots,
  onSelectDate,
  packageFlow,
}: {
  mode: 'hourly' | 'daily';
  packageOptions: PublicPackageOption[];
  packageId: string | null;
  selectedPackage: PublicPackageOption | null;
  listingTitle: string;
  listingPhotos: string[];
  date: string | null;
  today: string;
  from: string | null;
  to: string | null;
  availability: AvailabilityResponse | null;
  availabilityPending: boolean;
  slots: HourlySlot[];
  selectedSlots: HourlySlot[];
  onSelectDate: (date: string) => void;
  packageFlow: boolean;
}) {
  const { t } = useTranslation([NsI18n.Listing, NsI18n.Common]);
  const locale = useLocale();
  const todayDate = dateOnlyToLocal(today);
  const openDates = useMemo(
    () =>
      new Set(
        availability?.mode === 'daily'
          ? availability.days.filter((day) => day.status === 'available').map((day) => day.date)
          : [],
      ),
    [availability],
  );
  const dailyEndDate = useMemo(() => {
    if (availability?.mode !== 'daily' || availability.days.length === 0) return undefined;
    let latest = availability.days[0].date;
    for (const day of availability.days) {
      if (day.date > latest) latest = day.date;
    }
    return dateOnlyToLocal(latest);
  }, [availability]);
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
  const timeFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'vi-VN', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: availability?.timezone ?? DEFAULT_TZ,
      }),
    [availability?.timezone, locale],
  );
  const selectedSlotKeys = useMemo(
    () =>
      new Set(
        selectedSlots.map((slot) =>
          packageFlow ? `${slot.startUtc}:${slot.endUtc}` : slot.startUtc,
        ),
      ),
    [packageFlow, selectedSlots],
  );
  const slotModels = useMemo(
    () =>
      slots.map((slot) => ({
        key: `${slot.startUtc}:${slot.endUtc}`,
        slot,
        selected: selectedSlotKeys.has(
          packageFlow ? `${slot.startUtc}:${slot.endUtc}` : slot.startUtc,
        ),
        startLabel: timeFormatter.format(new Date(slot.startUtc)),
        endLabel: timeFormatter.format(new Date(slot.endUtc)),
        priceLabel: slot.available ? formatVnd(slot.price) : t('group.unavailableSlot'),
      })),
    [packageFlow, selectedSlotKeys, slots, t, timeFormatter],
  );
  const packageModels = useMemo(
    () =>
      packageOptions.map((item) => ({
        item,
        photo: item.photos[0] ?? listingPhotos[0],
        selected: packageId === item.id,
        priceLabel: formatVnd(item.price),
      })),
    [listingPhotos, packageId, packageOptions],
  );
  const selectedPackageGallery = useMemo(
    () =>
      selectedPackage
        ? {
            photos: selectedPackage.photos.length ? selectedPackage.photos : listingPhotos,
            title: `${listingTitle} — ${selectedPackage.name}`,
          }
        : null,
    [listingPhotos, listingTitle, selectedPackage],
  );

  function selectCalendarDay(day: Date | undefined): void {
    if (day) onSelectDate(localToDateOnly(day));
  }

  function isRangeDateDisabled(day: Date): boolean {
    return (
      day < todayDate ||
      availabilityPending ||
      (availability?.mode === 'daily' && !openDates.has(localToDateOnly(day)))
    );
  }

  return {
    calendarA11y,
    dailyEndDate,
    dailySoldOut: availability?.mode === 'daily' && openDates.size === 0,
    defaultRangeMonth: dateOnlyToLocal(from ?? today),
    hourlyDateInstruction: date
      ? `${dateLabelInTz(date, DEFAULT_TZ, locale)} · ${t(packageFlow ? 'packages.hourlyInstruction' : 'group.hourlyInstruction')}`
      : null,
    isRangeDateDisabled,
    packageModels,
    selectCalendarDay,
    selectedPackageGallery,
    selectedRange: from
      ? {
          from: dateOnlyToLocal(from),
          to: to ? dateOnlyToLocal(to) : undefined,
        }
      : undefined,
    selectionUnavailableMessage:
      mode === 'hourly' ? t('selectedSlotUnavailable') : t('unavailableRange'),
    slotModels,
    todayDate,
  };
}
