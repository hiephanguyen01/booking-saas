import type { AvailabilityResponse, HourlySlot } from '@booking/contracts';
import { useMemo } from 'react';
import { NsI18n, useTranslation } from '@booking/i18n';
import { dailyAvailabilityInRange, openDailyDates } from '~/lib/availability';
import type { PublicPackageOption } from '~/lib/package-options';
import { addDays, DEFAULT_TZ, dateLabelInTz, dateOnlyToLocal, localToDateOnly } from '~/lib/time';
import { formatVnd } from '~/lib/ui';
import { intlLocale } from '~/lib/intl';
import { useCalendarFormatters } from '~/hooks/use-calendar-formatters';
import { useLocale } from '~/hooks/use-locale';
import { monthOf } from '~/features/booking-widget/lib/sale-calendar';
import { discountPercent } from '~/lib/sale-campaign';

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
  calendarMonth,
  slots,
  selectedSlots,
  onSelectDate,
  onCalendarMonthChange,
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
  calendarMonth: string;
  slots: HourlySlot[];
  selectedSlots: HourlySlot[];
  onSelectDate: (date: string) => void;
  onCalendarMonthChange: (month: string) => void;
  packageFlow: boolean;
}) {
  const { t } = useTranslation([NsI18n.Listing, NsI18n.Common]);
  const locale = useLocale();
  const todayDate = dateOnlyToLocal(today);
  const openDates = useMemo(() => openDailyDates(availability), [availability]);
  const formatters = useCalendarFormatters(locale, 'narrow');
  const calendarA11y = useMemo(() => {
    const tag = intlLocale(locale);
    const caption = new Intl.DateTimeFormat(tag, { month: 'long', year: 'numeric' });
    const fullDate = new Intl.DateTimeFormat(tag, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    return {
      formatters,
      labels: {
        labelDayButton: (day: Date) => fullDate.format(day),
        labelGrid: (month?: Date) =>
          t('group.calendarLabel', { month: month ? caption.format(month) : '' }),
        labelNav: () => t('group.calendarNavigation'),
        labelPrevious: () => t('group.previousMonth'),
        labelNext: () => t('group.nextMonth'),
      },
    };
  }, [formatters, locale, t]);
  const timeFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(intlLocale(locale), {
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
      })),
    [packageFlow, selectedSlotKeys, slots, timeFormatter],
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
  const dailyPriceHints = useMemo(
    () =>
      dailyAvailabilityInRange(availability, from, to ?? (from ? addDays(from, 1) : null))
        .filter((day) => discountPercent(day.regularPrice, day.price) !== null)
        .map((day) => ({
          ...day,
          dateLabel: dateLabelInTz(day.date, availability?.timezone ?? DEFAULT_TZ, locale),
        })),
    [availability, from, locale, to],
  );

  function selectCalendarDay(day: Date | undefined): void {
    if (day) onSelectDate(localToDateOnly(day));
  }

  function changeCalendarMonth(day: Date): void {
    onCalendarMonthChange(monthOf(localToDateOnly(day)));
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
    calendarMonthDate: dateOnlyToLocal(`${calendarMonth}-01`),
    changeCalendarMonth,
    dailyPriceHints,
    dailySoldOut: availability?.mode === 'daily' && openDates.size === 0,
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
