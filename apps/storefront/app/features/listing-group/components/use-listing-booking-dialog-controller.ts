import type { HourlySlot, PublicListingDetailResponse } from '@booking/contracts';
import { useMemo, useState } from 'react';
import { useFetcher } from 'react-router';
import { normalizeDailyRange } from '../../../lib/daily-range';
import { NsI18n, useTranslation } from '../../../lib/i18n';
import { packagesForMode } from '../../../lib/package-options';
import {
  DEFAULT_TZ,
  addDays,
  dateLabelInTz,
  localToDateOnly,
  todayInTz,
  zonedToUtcIso,
} from '../../../lib/time';
import { useLocale } from '../../../lib/use-locale';
import type { loader as bookingDataLoader } from '../../../routes/listing-group-booking-data';
import {
  atomicHourlySlots,
  checkoutHref,
  slotInterval,
  toggleContiguousSlot,
} from '../listing-group-utils';
import type { ListingBookingMode, RoomBookingDateRange } from './room-booking-dialog-steps';

type BookingRequestKind = 'availability' | 'quote';

export function useListingBookingDialogController({
  listing,
  groupSlug,
  preferredMode,
}: {
  listing: PublicListingDetailResponse;
  groupSlug?: string;
  preferredMode: ListingBookingMode;
}) {
  const { t } = useTranslation([NsI18n.Listing, NsI18n.Common]);
  const locale = useLocale();
  const fetcher = useFetcher<typeof bookingDataLoader>();
  const supportedModes = listing.bookingModes.filter(
    (item): item is ListingBookingMode => item === 'hourly' || item === 'daily',
  );
  const initialMode = supportedModes.includes(preferredMode)
    ? preferredMode
    : (supportedModes[0] ?? 'hourly');
  const fixedPackages = listing.bookingSelection === 'fixed_packages';
  const dailyConfig = (listing.modeConfig.daily ?? {}) as {
    checkinTime?: string;
    checkoutTime?: string;
  };
  const dailyCheckinTime = dailyConfig.checkinTime ?? '14:00';
  const dailyCheckoutTime = dailyConfig.checkoutTime ?? '12:00';
  const packageOptions = (selectedMode: ListingBookingMode) =>
    packagesForMode(listing.modeConfig, selectedMode);
  const today = todayInTz(DEFAULT_TZ);
  const [desktopOpen, setDesktopOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mode, setMode] = useState<ListingBookingMode>(initialMode);
  const [packageId, setPackageId] = useState<string | null>(
    fixedPackages ? (packageOptions(initialMode)[0]?.id ?? null) : null,
  );
  const selectedPackage = packageOptions(mode).find((item) => item.id === packageId) ?? null;
  const [date, setDate] = useState<string | null>(null);
  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(null);
  const [selectedSlots, setSelectedSlots] = useState<HourlySlot[]>([]);
  const [selectionError, setSelectionError] = useState('');
  const [requestKind, setRequestKind] = useState<BookingRequestKind>('availability');
  const encodedListingSlug = encodeURIComponent(listing.slug);
  const basePath = groupSlug
    ? `/${locale}/g/${encodeURIComponent(groupSlug)}/rooms/${encodedListingSlug}/booking-data`
    : `/${locale}/l/${encodedListingSlug}/booking-data`;

  function load(
    next: {
      mode: ListingBookingMode;
      date?: string;
      from?: string | null;
      to?: string | null;
      start?: string;
      end?: string;
      packageId?: string | null;
    },
    kind: BookingRequestKind,
  ): void {
    setRequestKind(kind);
    const params = new URLSearchParams({ mode: next.mode });
    if (next.packageId ?? packageId) params.set('packageId', (next.packageId ?? packageId)!);
    if (next.mode === 'hourly' && next.date) params.set('date', next.date);
    if (next.mode === 'daily' && next.from) params.set('from', next.from);
    if (next.mode === 'daily' && next.to) params.set('to', next.to);
    if (next.start && next.end) {
      params.set('start', next.start);
      params.set('end', next.end);
    }
    void fetcher.load(`${basePath}?${params.toString()}`);
  }

  function reset(): void {
    setMode(initialMode);
    setPackageId(fixedPackages ? (packageOptions(initialMode)[0]?.id ?? null) : null);
    setDate(null);
    setFrom(null);
    setTo(null);
    setSelectedSlots([]);
    setSelectionError('');
    setRequestKind('availability');
  }

  function handleOpen(next: boolean, target: 'desktop' | 'mobile'): void {
    if (target === 'desktop') setDesktopOpen(next);
    else setMobileOpen(next);
    if (!next) {
      reset();
      return;
    }

    if (mode === 'hourly' && date) {
      const draftInterval = slotInterval(selectedSlots);
      load(
        {
          mode,
          date,
          start: draftInterval?.start,
          end: draftInterval?.end,
          packageId,
        },
        draftInterval ? 'quote' : 'availability',
      );
    } else if (mode === 'daily') {
      load({ mode, from: from ?? today, to, packageId }, from && to ? 'quote' : 'availability');
    }
  }

  function switchMode(next: ListingBookingMode): void {
    if (next === mode) return;
    setMode(next);
    const nextPackageId = fixedPackages ? (packageOptions(next)[0]?.id ?? null) : null;
    setPackageId(nextPackageId);
    setDate(null);
    setFrom(null);
    setTo(null);
    setSelectedSlots([]);
    setSelectionError('');
    if (next === 'daily')
      load({ mode: next, from: today, packageId: nextPackageId }, 'availability');
  }

  function selectPackage(nextPackageId: string): void {
    setPackageId(nextPackageId);
    setDate(null);
    setFrom(null);
    setTo(null);
    setSelectedSlots([]);
    if (mode === 'daily') {
      load({ mode, from: today, packageId: nextPackageId }, 'availability');
    }
  }

  const response = fetcher.data;
  const currentData =
    response?.ok &&
    response.mode === mode &&
    response.packageId === packageId &&
    (mode === 'hourly'
      ? response.date === date
      : response.from === (from ?? today) && response.to === to)
      ? response
      : null;
  const availability =
    currentData?.availability ??
    (mode === 'daily' &&
    response?.ok &&
    response.mode === 'daily' &&
    response.packageId === packageId
      ? response.availability
      : null);
  const slots = useMemo(
    () =>
      availability?.mode === 'hourly'
        ? fixedPackages
          ? availability.days.flatMap((day) => day.slots)
          : atomicHourlySlots(availability.days.flatMap((day) => day.slots))
        : [],
    [availability, fixedPackages],
  );
  const interval = slotInterval(selectedSlots);
  const selectionMatches = Boolean(
    currentData?.selectionStart &&
    currentData.selectionEnd &&
    (mode === 'daily' ||
      (interval?.start === currentData.selectionStart &&
        interval.end === currentData.selectionEnd)),
  );
  const hasCompleteSelection = mode === 'hourly' ? Boolean(interval) : Boolean(from && to);
  const availabilityPending = fetcher.state !== 'idle' && requestKind === 'availability';
  const quotePending = fetcher.state !== 'idle' && requestKind === 'quote';
  const requestError = fetcher.state === 'idle' && response && !response.ok;
  const selectionUnavailable = Boolean(
    hasCompleteSelection && fetcher.state === 'idle' && currentData && !currentData.quote,
  );
  const quote = selectionMatches ? currentData?.quote : null;
  const canBook = Boolean(fetcher.state === 'idle' && selectionMatches && quote);
  const bookingHref =
    canBook && currentData?.selectionStart && currentData.selectionEnd
      ? checkoutHref({
          locale,
          listingSlug: listing.slug,
          mode,
          start: currentData.selectionStart,
          end: currentData.selectionEnd,
          ...(packageId ? { packageId } : {}),
        })
      : null;

  function selectDate(nextDate: string): void {
    setDate(nextDate);
    setSelectedSlots([]);
    setSelectionError('');
    load({ mode: 'hourly', date: nextDate, packageId }, 'availability');
  }

  function changeDate(): void {
    setDate(null);
    setSelectedSlots([]);
    setSelectionError('');
  }

  function toggleSlot(slot: HourlySlot): void {
    if (!slot.available || !date) return;
    if (fixedPackages) {
      const nextSlots = selectedSlots.some(
        (item) => item.startUtc === slot.startUtc && item.endUtc === slot.endUtc,
      )
        ? []
        : [slot];
      setSelectedSlots(nextSlots);
      setSelectionError('');
      if (nextSlots.length) {
        load({ mode: 'hourly', date, start: slot.startUtc, end: slot.endUtc, packageId }, 'quote');
      }
      return;
    }
    const result = toggleContiguousSlot(selectedSlots, slot);
    if (!result.changed) {
      setSelectionError(t('group.contiguousOnly'));
      return;
    }

    setSelectedSlots(result.slots);
    setSelectionError('');
    const nextInterval = slotInterval(result.slots);
    if (nextInterval) {
      load(
        {
          mode: 'hourly',
          date,
          start: nextInterval.start,
          end: nextInterval.end,
        },
        'quote',
      );
    }
  }

  function selectRange(next: RoomBookingDateRange | undefined): void {
    const nextFrom = next?.from ? localToDateOnly(next.from) : null;
    const dailyPackage = packageOptions('daily').find((item) => item.id === packageId);
    const nextTo =
      fixedPackages && nextFrom && dailyPackage
        ? addDays(nextFrom, dailyPackage.duration)
        : next?.to
          ? localToDateOnly(next.to)
          : null;
    setFrom(nextFrom);
    setTo(nextTo);
    setSelectionError('');
    if (nextFrom && nextTo) {
      load({ mode: 'daily', from: nextFrom, to: nextTo, packageId }, 'quote');
    }
  }

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
  const bookingTimezone = availability?.timezone ?? DEFAULT_TZ;
  const bookingDateTimeFormatter = useMemo(() => {
    const tag = locale === 'en' ? 'en-GB' : 'vi-VN';
    const weekday = new Intl.DateTimeFormat(tag, {
      weekday: 'long',
      timeZone: bookingTimezone,
    });
    const time = new Intl.DateTimeFormat(tag, {
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
      timeZone: bookingTimezone,
    });
    const date = new Intl.DateTimeFormat(tag, {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      timeZone: bookingTimezone,
    });

    return (value: string): string =>
      `${weekday.format(new Date(value))}, ${time.format(new Date(value))} ${date.format(new Date(value))}`;
  }, [bookingTimezone, locale]);
  const numberFormatter = useMemo(
    () => new Intl.NumberFormat(locale === 'en' ? 'en-GB' : 'vi-VN', { maximumFractionDigits: 1 }),
    [locale],
  );
  const selectionSummary = useMemo(() => {
    if (mode === 'hourly' && date && interval) {
      const duration = (Date.parse(interval.end) - Date.parse(interval.start)) / (60 * 60 * 1000);
      return `${dateLabelInTz(date, DEFAULT_TZ, locale)} · ${timeFormatter.format(new Date(interval.start))}–${timeFormatter.format(new Date(interval.end))} · ${t('hours', { count: numberFormatter.format(duration) })}`;
    }
    if (mode === 'daily' && from && to) {
      const effectiveTo = normalizeDailyRange(from, to)?.to ?? to;
      const selectionStart =
        currentData?.selectionStart ?? zonedToUtcIso(from, dailyCheckinTime, bookingTimezone);
      const selectionEnd =
        currentData?.selectionEnd ?? zonedToUtcIso(effectiveTo, dailyCheckoutTime, bookingTimezone);
      return `${bookingDateTimeFormatter(selectionStart)} – ${bookingDateTimeFormatter(selectionEnd)}`;
    }
    return null;
  }, [
    bookingDateTimeFormatter,
    bookingTimezone,
    currentData,
    dailyCheckinTime,
    dailyCheckoutTime,
    date,
    from,
    interval,
    locale,
    mode,
    numberFormatter,
    t,
    timeFormatter,
    to,
  ]);

  return {
    triggerLabel: t('group.chooseSchedule'),
    shellProps: {
      desktopOpen,
      mobileOpen,
      onDesktopOpenChange: (next: boolean) => handleOpen(next, 'desktop'),
      onMobileOpenChange: (next: boolean) => handleOpen(next, 'mobile'),
      title: t('group.chooseSchedule'),
      description: listing.title,
    },
    stepsProps: {
      mode,
      supportedModes,
      fixedPackages,
      packageOptions: packageOptions(mode),
      packageId,
      selectedPackage,
      listingTitle: listing.title,
      listingPhotos: listing.photos,
      date,
      from,
      to,
      availability,
      availabilityPending,
      requestError: Boolean(requestError),
      slots,
      selectedSlots,
      selectionError,
      selectionUnavailable,
      onSwitchMode: switchMode,
      onSelectPackage: selectPackage,
      onSelectDate: selectDate,
      onChangeDate: changeDate,
      onToggleSlot: toggleSlot,
      onSelectRange: selectRange,
      onRetryHourly: () => {
        if (date) load({ mode, date }, 'availability');
      },
      onRetryDaily: () =>
        load({ mode, from: from ?? today, to }, from && to ? 'quote' : 'availability'),
    },
    footerProps: {
      selectionSummary,
      quote: quote?.subtotal ?? null,
      quotePending,
      bookingHref,
      disabledLabel: quotePending
        ? t('group.calculatingPrice')
        : mode === 'hourly'
          ? date
            ? t('group.chooseHoursToContinue')
            : t('group.chooseDayToContinue')
          : t('group.chooseRangeToContinue'),
    },
  };
}
