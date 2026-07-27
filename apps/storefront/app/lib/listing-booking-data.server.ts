import {
  MAX_BOOKING_RANGE_DAYS,
  bookingDateRangeSchema,
  timeOfDaySchema,
  type AvailabilityMode,
  type PublicListingDetailResponse,
} from '@booking/contracts';
import { data } from 'react-router';
import { fetchAvailability } from './booking.server';
import { fetchQuote } from './catalog.server';
import { canOffsetDateOnly, isValidDateOnly } from './date-only';
import { datesInDailyRange, eligibleDailyRange } from './daily-range';
import { rethrowCriticalDataError } from './optional-data.server';
import { selectedPackageForListing } from './package-options';
import { addDays, DEFAULT_TZ, todayInTz, zonedToUtcIso } from './time';

export type BookingDataError = 'invalid-request' | 'room-not-found' | 'availability-unavailable';

/**
 * Resolves the availability and quote payload used by booking-data resource routes.
 * Callers are responsible for loading the listing and applying route-specific access checks.
 */
export async function loadListingBookingData(
  request: Request,
  listing: PublicListingDetailResponse,
  url: URL,
) {
  try {
    const requestedMode = url.searchParams.get('mode');
    const mode: AvailabilityMode | null =
      requestedMode === 'hourly' || requestedMode === 'daily' ? requestedMode : null;
    if (!mode || !listing.bookingModes.includes(mode)) {
      return bookingDataError('invalid-request', 400);
    }

    const requestedPackageId = url.searchParams.get('packageId');
    const selectedPackage = selectedPackageForListing(listing, mode, requestedPackageId);
    if (
      (listing.bookingSelection === 'fixed_packages' && !selectedPackage) ||
      (listing.bookingSelection !== 'fixed_packages' && requestedPackageId !== null)
    ) {
      return bookingDataError('invalid-request', 400);
    }
    const packageId = selectedPackage?.id;

    const timezone = DEFAULT_TZ;
    if (mode === 'hourly') {
      const requestedDate = url.searchParams.get('date');
      const dateValue =
        requestedDate && isValidDateOnly(requestedDate) ? requestedDate : todayInTz(timezone);
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
    const from =
      requestedFrom && canOffsetDateOnly(requestedFrom, MAX_BOOKING_RANGE_DAYS)
        ? requestedFrom
        : todayInTz(timezone);
    const requestedTo = url.searchParams.get('to');
    const to = requestedTo && isValidDateOnly(requestedTo) ? requestedTo : null;
    const availability = await fetchAvailability(request, listing.slug, {
      mode,
      from,
      to: addDays(from, MAX_BOOKING_RANGE_DAYS - 1),
      ...(packageId ? { packageId } : {}),
    });
    const config = (listing.modeConfig.daily ?? {}) as Record<string, unknown>;
    const durationDays = selectedPackage?.duration ?? 0;
    const fixedPackageRange =
      listing.bookingSelection === 'fixed_packages' &&
      durationDays > 0 &&
      durationDays <= MAX_BOOKING_RANGE_DAYS &&
      canOffsetDateOnly(from, durationDays)
        ? { from, to: addDays(from, durationDays) }
        : null;
    const effectiveTo = fixedPackageRange?.to ?? to;
    const minNights = finiteNumber(config.minNights, 1);
    const maxNights = finiteNumber(config.maxNights, Number.POSITIVE_INFINITY);
    const flexibleRange = effectiveTo
      ? eligibleDailyRange(from, effectiveTo, minNights, maxNights)
      : null;
    const range =
      listing.bookingSelection === 'fixed_packages'
        ? fixedPackageRange && bookingDateRangeSchema.safeParse(fixedPackageRange).success
          ? fixedPackageRange
          : null
        : flexibleRange;
    const openDates = new Set(
      availability.mode === 'daily'
        ? availability.days.filter((day) => day.status === 'available').map((day) => day.date)
        : [],
    );
    const selectionAvailable = Boolean(
      range &&
      (listing.bookingSelection === 'fixed_packages'
        ? openDates.has(range.from)
        : datesInDailyRange(flexibleRange!).every((dateValue) => openDates.has(dateValue))),
    );
    const checkinTime = validTime(config.checkinTime, '14:00');
    const checkoutTime = validTime(config.checkoutTime, '12:00');
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
  } catch (error) {
    rethrowCriticalDataError(error);
    return bookingDataError('availability-unavailable', 502);
  }
}

export function bookingDataError(error: BookingDataError, status: 400 | 404 | 502) {
  return data({ ok: false as const, error }, { status });
}

function finiteNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function validTime(value: unknown, fallback: string): string {
  const parsed = timeOfDaySchema.safeParse(value);
  return parsed.success ? parsed.data : fallback;
}
