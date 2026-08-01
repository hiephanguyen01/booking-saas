import type { AvailabilityCalendarResponse } from '@booking/contracts';
import type { Locale } from '@booking/i18n';
import { useCallback, useEffect, useState } from 'react';
import { useFetcher } from 'react-router';
import { storefrontPaths } from '~/constants/paths';
import { monthBounds, monthOf } from '~/features/booking-widget/lib/sale-calendar';
import type { ListingSaleCalendarResult } from '~/features/booking-widget/server/listing-sale-calendar.server';
import type { ScheduledBookingMode } from '~/features/booking-widget/lib/booking-modes';

interface BookingSaleCalendarOptions {
  open: boolean;
  locale: Locale;
  listingSlug: string;
  groupSlug?: string;
  mode: ScheduledBookingMode;
  today: string;
  fixedPackages: boolean;
  packageId: string | null;
}

interface BookingSaleCalendarState {
  month: string;
  calendar: AvailabilityCalendarResponse | null;
  pending: boolean;
  error: boolean;
  loadMonth(month: string): void;
  reload(): void;
}

function requestKey(mode: ScheduledBookingMode, month: string, packageId: string | null): string {
  return `${mode}:${month}:${packageId ?? ''}`;
}

export function useBookingSaleCalendar({
  open,
  locale,
  listingSlug,
  groupSlug,
  mode,
  today,
  fixedPackages,
  packageId,
}: BookingSaleCalendarOptions): BookingSaleCalendarState {
  const fetcher = useFetcher<ListingSaleCalendarResult>();
  const fetcherLoad = fetcher.load;
  const [month, setMonth] = useState(() => monthOf(today));
  const [requestedKey, setRequestedKey] = useState<string | null>(null);
  const basePath = groupSlug
    ? storefrontPaths.listingGroupRoomSaleCalendar(locale, groupSlug, listingSlug)
    : storefrontPaths.listingSaleCalendar(locale, listingSlug);
  const canLoad = !fixedPackages || Boolean(packageId);

  const loadCalendar = useCallback(
    (nextMonth: string): void => {
      if (!canLoad) return;
      const params = new URLSearchParams({ mode, month: nextMonth });
      if (packageId) params.set('packageId', packageId);
      setRequestedKey(requestKey(mode, nextMonth, packageId));
      void fetcherLoad(`${basePath}?${params.toString()}`);
    },
    [basePath, canLoad, fetcherLoad, mode, packageId],
  );

  useEffect(() => {
    if (open) loadCalendar(month);
  }, [loadCalendar, month, open]);

  function loadMonth(nextMonth: string): void {
    try {
      monthBounds(nextMonth);
    } catch {
      return;
    }

    if (nextMonth === month) {
      if (open) loadCalendar(nextMonth);
      return;
    }
    setMonth(nextMonth);
  }

  const currentKey = requestKey(mode, month, packageId);
  const response = fetcher.data;
  const responseMatches = Boolean(
    response?.ok &&
    response.mode === mode &&
    response.month === month &&
    response.packageId === packageId,
  );
  const activeRequest = requestedKey === currentKey;

  return {
    month,
    calendar: responseMatches && response?.ok ? response.calendar : null,
    pending: activeRequest && fetcher.state !== 'idle',
    error: activeRequest && fetcher.state === 'idle' && response !== undefined && !response.ok,
    loadMonth,
    reload: () => loadCalendar(month),
  };
}
