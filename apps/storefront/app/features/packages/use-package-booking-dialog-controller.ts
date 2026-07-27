import type {
  AvailabilityResponse,
  HourlySlot,
  PublicListingDetailWithTimezoneResponse,
} from '@booking/contracts';
import { useEffect, useMemo, useState, type RefObject } from 'react';
import { useFetcher } from 'react-router';
import { NsI18n, useTranslation } from '../../lib/i18n';
import type { PublicPackageOption } from '../../lib/package-options';
import { dateLabelInTz } from '../../lib/time';
import { useLocale } from '../../lib/use-locale';
import type { loader as bookingDataLoader } from '../../routes/listing-booking-data';
import { checkoutHref, slotInterval } from '../listing-group/listing-group-utils';

type BookingRequestKind = 'availability' | 'quote';

export function usePackageBookingDialogController({
  listing,
  selectedPackage,
  onOpenChange,
  returnFocusRef,
}: {
  listing: PublicListingDetailWithTimezoneResponse;
  selectedPackage: PublicPackageOption | null;
  onOpenChange: (open: boolean) => void;
  returnFocusRef: RefObject<HTMLButtonElement | null>;
}) {
  const { t } = useTranslation([NsI18n.Listing, NsI18n.Common]);
  const locale = useLocale();
  const fetcher = useFetcher<typeof bookingDataLoader>();
  const [date, setDate] = useState<string | null>(null);
  const [selectedSlots, setSelectedSlots] = useState<HourlySlot[]>([]);
  const [cachedAvailability, setCachedAvailability] = useState<AvailabilityResponse | null>(null);
  const [requestKind, setRequestKind] = useState<BookingRequestKind>('availability');
  const packageId = selectedPackage?.id ?? null;
  const basePath = `/${locale}/l/${encodeURIComponent(listing.slug)}/booking-data`;

  function load(
    next: { date: string; start?: string; end?: string },
    kind: BookingRequestKind,
  ): void {
    if (!packageId) return;
    setRequestKind(kind);
    const params = new URLSearchParams({
      mode: 'hourly',
      date: next.date,
      packageId,
    });
    if (next.start && next.end) {
      params.set('start', next.start);
      params.set('end', next.end);
    }
    void fetcher.load(`${basePath}?${params.toString()}`);
  }

  function resetSelection(): void {
    setDate(null);
    setSelectedSlots([]);
    setCachedAvailability(null);
    setRequestKind('availability');
  }

  function changeOpen(next: boolean): void {
    if (!next) resetSelection();
    onOpenChange(next);
    if (!next) requestAnimationFrame(() => returnFocusRef.current?.focus());
  }

  function selectDate(nextDate: string): void {
    setDate(nextDate);
    setSelectedSlots([]);
    setCachedAvailability(null);
    load({ date: nextDate }, 'availability');
  }

  function changeDate(): void {
    setDate(null);
    setSelectedSlots([]);
    setCachedAvailability(null);
  }

  function toggleSlot(slot: HourlySlot): void {
    if (!slot.available || !date) return;
    const selected = selectedSlots.some(
      (item) => item.startUtc === slot.startUtc && item.endUtc === slot.endUtc,
    );
    const nextSlots = selected ? [] : [slot];
    setSelectedSlots(nextSlots);
    if (!selected) {
      load({ date, start: slot.startUtc, end: slot.endUtc }, 'quote');
    }
  }

  const response = fetcher.data;
  const currentData =
    response?.ok &&
    response.mode === 'hourly' &&
    response.date === date &&
    response.packageId === packageId
      ? response
      : null;

  useEffect(() => {
    if (currentData?.availability) setCachedAvailability(currentData.availability);
  }, [currentData]);

  const availability = currentData?.availability ?? cachedAvailability;
  const timezone = availability?.timezone ?? listing.timezone;
  const slots = useMemo(
    () => (availability?.mode === 'hourly' ? availability.days.flatMap((day) => day.slots) : []),
    [availability],
  );
  const interval = slotInterval(selectedSlots);
  const selectionMatches = Boolean(
    interval &&
      currentData?.selectionStart === interval.start &&
      currentData.selectionEnd === interval.end,
  );
  const quote = selectionMatches ? currentData?.quote : null;
  const availabilityPending = fetcher.state !== 'idle' && requestKind === 'availability';
  const quotePending = fetcher.state !== 'idle' && requestKind === 'quote' && Boolean(interval);
  const requestError = fetcher.state === 'idle' && response && !response.ok;
  const availabilityError = Boolean(requestError && requestKind === 'availability');
  const quoteError = Boolean(requestError && requestKind === 'quote' && interval);
  const selectionUnavailable = Boolean(
    interval && fetcher.state === 'idle' && currentData && !selectionMatches && !currentData.quote,
  );
  const canBook = Boolean(fetcher.state === 'idle' && selectionMatches && quote);
  const bookingHref =
    canBook && currentData?.selectionStart && currentData.selectionEnd && packageId
      ? checkoutHref({
          locale,
          listingSlug: listing.slug,
          mode: 'hourly',
          start: currentData.selectionStart,
          end: currentData.selectionEnd,
          packageId,
        })
      : null;

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
  const numberFormatter = useMemo(
    () => new Intl.NumberFormat(locale === 'en' ? 'en-GB' : 'vi-VN', { maximumFractionDigits: 1 }),
    [locale],
  );
  const selectionSummary = useMemo(() => {
    if (!date || !interval) return null;
    const duration = (Date.parse(interval.end) - Date.parse(interval.start)) / (60 * 60 * 1000);
    return `${dateLabelInTz(date, timezone, locale)} · ${timeFormatter.format(new Date(interval.start))}–${timeFormatter.format(new Date(interval.end))} · ${t('hours', { count: numberFormatter.format(duration) })}`;
  }, [date, interval, locale, numberFormatter, t, timeFormatter, timezone]);

  function retryAvailability(): void {
    if (date) load({ date }, 'availability');
  }

  function retryQuote(): void {
    if (date && interval) load({ date, start: interval.start, end: interval.end }, 'quote');
  }

  return {
    date,
    timezone,
    availabilityPending,
    hasAvailability: Boolean(availability),
    availabilityError,
    slots,
    selectedSlots,
    quotePending,
    quoteError,
    selectionUnavailable,
    selectionSummary,
    quoteSubtotal: quote?.subtotal ?? null,
    bookingHref,
    changeOpen,
    selectDate,
    changeDate,
    toggleSlot,
    retryAvailability,
    retryQuote,
  };
}
