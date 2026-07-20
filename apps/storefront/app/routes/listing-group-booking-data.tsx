import { data } from 'react-router';
import type { AvailabilityMode } from '@booking/contracts';
import type { Route } from './+types/listing-group-booking-data';
import { fetchAvailability } from '../lib/booking.server';
import { fetchListing, fetchQuote } from '../lib/catalog.server';
import { eligibleDailyRange } from '../lib/daily-range';
import { addDays, DEFAULT_TZ, todayInTz, zonedToUtcIso } from '../lib/time';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type BookingDataError = 'invalid-request' | 'room-not-found' | 'availability-unavailable';

export async function loader({ request, params, url }: Route.LoaderArgs) {
  try {
    const listing = await fetchListing(request, params.listingSlug);
    if (!listing || listing.group?.slug !== params.groupSlug) {
      return bookingError('room-not-found', 404);
    }

    const requestedMode = url.searchParams.get('mode');
    const mode: AvailabilityMode | null =
      requestedMode === 'hourly' || requestedMode === 'daily' ? requestedMode : null;
    if (!mode || !listing.bookingModes.includes(mode)) {
      return bookingError('invalid-request', 400);
    }
    const packageId = url.searchParams.get('packageId') ?? undefined;
    if (listing.bookingSelection === 'fixed_packages' && !packageId) {
      return bookingError('invalid-request', 400);
    }

    const timezone = DEFAULT_TZ;
    if (mode === 'hourly') {
      const requestedDate = url.searchParams.get('date');
      const dateValue =
        requestedDate && DATE_RE.test(requestedDate) ? requestedDate : todayInTz(timezone);
      const availability = await fetchAvailability(request, listing.slug, {
        mode,
        from: dateValue,
        to: dateValue,
        ...(packageId ? { packageId } : {}),
      });
      const start = url.searchParams.get('start');
      const end = url.searchParams.get('end');
      const selectionAvailable = Boolean(
        start &&
        end &&
        availability.mode === 'hourly' &&
        availability.days.some((day) =>
          day.slots.some(
            (slot) => slot.startUtc === start && slot.endUtc === end && slot.available,
          ),
        ),
      );
      const quote = selectionAvailable
        ? await fetchQuote(
            request,
            listing.slug,
            new URLSearchParams({
              mode,
              from: start!,
              to: end!,
              quantity: '1',
              ...(packageId ? { packageId } : {}),
            }),
          )
        : null;
      return {
        ok: true as const,
        mode,
        date: dateValue,
        from: null,
        to: null,
        availability,
        quote,
        selectionStart: selectionAvailable ? start : null,
        selectionEnd: selectionAvailable ? end : null,
        packageId: packageId ?? null,
      };
    }

    const requestedFrom = url.searchParams.get('from');
    const from = requestedFrom && DATE_RE.test(requestedFrom) ? requestedFrom : todayInTz(timezone);
    const requestedTo = url.searchParams.get('to');
    const to = requestedTo && DATE_RE.test(requestedTo) ? requestedTo : null;
    const availability = await fetchAvailability(request, listing.slug, {
      mode,
      from,
      to: addDays(from, 30),
      ...(packageId ? { packageId } : {}),
    });
    const config = (listing.modeConfig.daily ?? {}) as Record<string, unknown>;
    const selectedPackage = Array.isArray(config.packages)
      ? (config.packages.find(
          (item) =>
            item && typeof item === 'object' && (item as Record<string, unknown>).id === packageId,
        ) as Record<string, unknown> | undefined)
      : undefined;
    const durationDays = finiteNumber(selectedPackage?.durationDays, 0);
    const effectiveTo =
      listing.bookingSelection === 'fixed_packages' && durationDays > 0
        ? addDays(from, durationDays)
        : to;
    const minNights = finiteNumber(config.minNights, 1);
    const maxNights = finiteNumber(config.maxNights, Number.POSITIVE_INFINITY);
    const range = effectiveTo
      ? listing.bookingSelection === 'fixed_packages'
        ? { from, to: effectiveTo }
        : eligibleDailyRange(from, effectiveTo, minNights, maxNights)
      : null;
    const openDates = new Set(
      availability.mode === 'daily'
        ? availability.days.filter((day) => day.status === 'available').map((day) => day.date)
        : [],
    );
    const selectionAvailable = Boolean(
      range &&
      (listing.bookingSelection === 'fixed_packages'
        ? openDates.has(range.from)
        : datesInRange(range.from, range.to).every((dateValue) => openDates.has(dateValue))),
    );
    const checkinTime = typeof config.checkinTime === 'string' ? config.checkinTime : '14:00';
    const checkoutTime = typeof config.checkoutTime === 'string' ? config.checkoutTime : '12:00';
    const selectionStart = selectionAvailable
      ? zonedToUtcIso(range!.from, checkinTime, availability.timezone)
      : null;
    const selectionEnd = selectionAvailable
      ? zonedToUtcIso(range!.to, checkoutTime, availability.timezone)
      : null;
    const quote =
      selectionStart && selectionEnd
        ? await fetchQuote(
            request,
            listing.slug,
            new URLSearchParams({
              mode,
              from: selectionStart,
              to: selectionEnd,
              quantity: '1',
              ...(packageId ? { packageId } : {}),
            }),
          )
        : null;

    return {
      ok: true as const,
      mode,
      date: null,
      from,
      to: effectiveTo,
      availability,
      quote,
      selectionStart,
      selectionEnd,
      packageId: packageId ?? null,
    };
  } catch {
    return bookingError('availability-unavailable', 502);
  }
}

function bookingError(error: BookingDataError, status: 400 | 404 | 502) {
  return data({ ok: false as const, error }, { status });
}

function finiteNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function datesInRange(from: string, to: string): string[] {
  const dates: string[] = [];
  for (let cursor = from; cursor < to; cursor = addDays(cursor, 1)) dates.push(cursor);
  return dates;
}
