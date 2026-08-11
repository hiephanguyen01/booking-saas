import type {
  AvailabilityResponse,
  HourlySlot,
  PublicListingDetailWithTimezoneResponse,
} from '@booking/contracts';
import { useEffect, useMemo, useState, type RefObject } from 'react';
import { useFetcher } from 'react-router';
import { storefrontPaths } from '~/constants/paths';
import { dailyModeConfig } from '~/lib/daily-config';
import { normalizeDailyRange } from '~/lib/daily-range';
import { NsI18n, useTranslation } from '@booking/i18n';
import { intlLocale } from '~/lib/intl';
import { packagesForMode } from '~/lib/package-options';
import { addDays, dateLabelInTz, localToDateOnly, zonedToUtcIso } from '~/lib/time';
import { useLocale } from '~/hooks/use-locale';
import type { ListingBookingDataResult } from '~/features/booking-widget/server/listing-booking-data.server';
import {
  atomicHourlySlots,
  checkoutHref,
  slotInterval,
  toggleContiguousSlot,
} from '~/features/booking-widget/lib/slot-selection';
import type { RoomBookingDateRange } from '~/features/booking-widget/components/booking-dialog-steps';
import {
  scheduledBookingModes,
  type ScheduledBookingMode,
} from '~/features/booking-widget/lib/booking-modes';

type BookingRequestKind = 'availability' | 'quote';

export function useBookingDialogController({
  listing,
  groupSlug,
  preferredMode,
  today,
  controlled,
  controlledPackageId,
  returnFocusRef,
}: {
  listing: PublicListingDetailWithTimezoneResponse;
  groupSlug?: string;
  preferredMode: ScheduledBookingMode;
  today: string;
  controlled?: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
  };
  controlledPackageId?: string | null;
  returnFocusRef?: RefObject<HTMLButtonElement | null>;
}) {
  const { t } = useTranslation([NsI18n.Listing, NsI18n.Common]);
  const locale = useLocale();
  const fetcher = useFetcher<ListingBookingDataResult>();
  const supportedModes = scheduledBookingModes(listing.bookingModes);
  const initialMode = supportedModes.includes(preferredMode)
    ? preferredMode
    : (supportedModes[0] ?? 'hourly');
  const fixedPackages = listing.bookingSelection === 'fixed_packages';
  const { checkinTime: dailyCheckinTime, checkoutTime: dailyCheckoutTime } = dailyModeConfig(
    listing.modeConfig,
  );
  // Parsed once per listing rather than on every read: `packagesForMode` walks the
  // untyped `modeConfig` jsonb, and the render path alone asks for it several times.
  const packagesByMode = useMemo(
    () => ({
      hourly: packagesForMode(listing.modeConfig, 'hourly'),
      daily: packagesForMode(listing.modeConfig, 'daily'),
    }),
    [listing.modeConfig],
  );
  const packageOptions = (selectedMode: ScheduledBookingMode) => packagesByMode[selectedMode];
  const firstPackageId = (selectedMode: ScheduledBookingMode) =>
    fixedPackages ? (packageOptions(selectedMode)[0]?.id ?? null) : null;
  const [desktopOpen, setDesktopOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mode, setMode] = useState<ScheduledBookingMode>(initialMode);
  const [internalPackageId, setInternalPackageId] = useState<string | null>(
    firstPackageId(initialMode),
  );
  const packageId = controlled ? (controlledPackageId ?? null) : internalPackageId;
  const selectedPackage = packageOptions(mode).find((item) => item.id === packageId) ?? null;
  const [date, setDate] = useState<string | null>(null);
  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(null);
  const [selectedSlots, setSelectedSlots] = useState<HourlySlot[]>([]);
  const [cachedAvailability, setCachedAvailability] = useState<AvailabilityResponse | null>(null);
  const [selectionError, setSelectionError] = useState('');
  const [requestKind, setRequestKind] = useState<BookingRequestKind>('availability');
  const basePath = groupSlug
    ? storefrontPaths.listingGroupRoomBookingData(locale, groupSlug, listing.slug)
    : storefrontPaths.listingBookingData(locale, listing.slug);

  function load(
    next: {
      mode: ScheduledBookingMode;
      date?: string;
      from?: string | null;
      to?: string | null;
      start?: string;
      end?: string;
      packageId?: string | null;
    },
    kind: BookingRequestKind,
  ): void {
    const requestPackageId = next.packageId ?? packageId;
    if (fixedPackages && !requestPackageId) return;
    setRequestKind(kind);
    const params = new URLSearchParams({ mode: next.mode });
    if (requestPackageId) params.set('packageId', requestPackageId);
    if (next.mode === 'hourly' && next.date) params.set('date', next.date);
    if (next.mode === 'daily' && next.from) params.set('from', next.from);
    if (next.mode === 'daily' && next.to) params.set('to', next.to);
    if (next.start && next.end) {
      params.set('start', next.start);
      params.set('end', next.end);
    }
    void fetcher.load(`${basePath}?${params.toString()}`);
  }

  /** Drops every part of a selection that a mode, package or date change invalidates. */
  function clearSelection(): void {
    setDate(null);
    setFrom(null);
    setTo(null);
    setSelectedSlots([]);
    setCachedAvailability(null);
    setSelectionError('');
  }

  function reset(): void {
    clearSelection();
    setMode(initialMode);
    setInternalPackageId(firstPackageId(initialMode));
    setRequestKind('availability');
  }

  function handleOpen(next: boolean, target: 'desktop' | 'mobile'): void {
    if (target === 'desktop') setDesktopOpen(next);
    else setMobileOpen(next);
    if (next) reloadSelection();
    else reset();
  }

  function changeControlledOpen(next: boolean): void {
    if (!next) reset();
    controlled?.onOpenChange(next);
    if (!next) requestAnimationFrame(() => returnFocusRef?.current?.focus());
  }

  function switchMode(next: ScheduledBookingMode): void {
    if (next === mode) return;
    const nextPackageId = firstPackageId(next);
    clearSelection();
    setMode(next);
    setInternalPackageId(nextPackageId);
    if (next === 'daily')
      load({ mode: next, from: today, packageId: nextPackageId }, 'availability');
  }

  function selectPackage(nextPackageId: string): void {
    clearSelection();
    setInternalPackageId(nextPackageId);
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
  const responseAvailability =
    currentData?.availability ??
    (mode === 'daily' &&
    response?.ok &&
    response.mode === 'daily' &&
    response.packageId === packageId
      ? response.availability
      : null);
  useEffect(() => {
    if (responseAvailability) setCachedAvailability(responseAvailability);
  }, [responseAvailability]);
  const availability = responseAvailability ?? cachedAvailability;
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
  const requestError = fetcher.state === 'idle' && response !== undefined && !response.ok;
  const availabilityError = requestError && requestKind === 'availability';
  const quoteError = requestError && requestKind === 'quote' && hasCompleteSelection;
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

  /**
   * Re-issues the request that matches the current selection: a quote once the
   * selection is complete, plain availability otherwise. Reopening the dialog and
   * both retry buttons want exactly this.
   */
  function reloadSelection(): void {
    if (mode === 'hourly') {
      if (!date) return;
      load(
        { mode, date, start: interval?.start, end: interval?.end, packageId },
        interval ? 'quote' : 'availability',
      );
      return;
    }
    load({ mode, from: from ?? today, to, packageId }, from && to ? 'quote' : 'availability');
  }

  function selectDate(nextDate: string): void {
    clearSelection();
    setDate(nextDate);
    load({ mode: 'hourly', date: nextDate, packageId }, 'availability');
  }

  function changeDate(): void {
    clearSelection();
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
    const dailyPackage = packagesByMode.daily.find((item) => item.id === packageId);
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

  const bookingTimezone = availability?.timezone ?? listing.timezone;
  const timeFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(intlLocale(locale), {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: bookingTimezone,
      }),
    [bookingTimezone, locale],
  );
  const bookingDateTimeFormatter = useMemo(() => {
    const tag = intlLocale(locale);
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
    const dateFormatter = new Intl.DateTimeFormat(tag, {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      timeZone: bookingTimezone,
    });

    return (value: string): string => {
      const at = new Date(value);
      return `${weekday.format(at)}, ${time.format(at)} ${dateFormatter.format(at)}`;
    };
  }, [bookingTimezone, locale]);
  const numberFormatter = useMemo(
    () => new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits: 1 }),
    [locale],
  );
  const selectionSummary = useMemo(() => {
    if (mode === 'hourly' && date && interval) {
      const duration = (Date.parse(interval.end) - Date.parse(interval.start)) / (60 * 60 * 1000);
      return `${dateLabelInTz(date, bookingTimezone, locale)} · ${timeFormatter.format(new Date(interval.start))}–${timeFormatter.format(new Date(interval.end))} · ${t('hours', { count: numberFormatter.format(duration) })}`;
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
    triggerLabel: t('group.bookNow'),
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
      availabilityError,
      requestError,
      slots,
      selectedSlots,
      selectionError,
      selectionUnavailable,
      quoteError,
      onSwitchMode: switchMode,
      onSelectPackage: selectPackage,
      onSelectDate: selectDate,
      onChangeDate: changeDate,
      onToggleSlot: toggleSlot,
      onSelectRange: selectRange,
      // Deliberately not `reloadSelection`: this button re-fetches the day's
      // availability, discarding any half-made slot selection.
      onRetryHourly: () => {
        if (date) load({ mode, date }, 'availability');
      },
      onRetryQuote: reloadSelection,
      onRetryDaily: reloadSelection,
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
    changeControlledOpen,
  };
}
