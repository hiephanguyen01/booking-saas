import {
  MAX_BOOKING_RANGE_DAYS,
  bookingDateRangeSchema,
  type AvailabilityMode,
  type PublicListingDetailWithTimezoneResponse,
} from '@booking/contracts';
import { data } from 'react-router';
import { fetchAvailability } from '~/features/booking/server/booking.server';
import { fetchListing, fetchQuote } from '~/features/catalog/server/catalog.server';
import { openDailyDates } from '~/lib/availability';
import { canOffsetDateOnly, isValidDateOnly } from '~/lib/date-only';
import { dailyModeConfig } from '~/lib/daily-config';
import { datesInDailyRange, eligibleDailyRange } from '~/lib/daily-range';
import { rethrowCriticalDataError } from '~/lib/server/optional-data.server';
import { selectedPackageForListing } from '~/lib/package-options';
import type { ServerDataFrom } from '~/lib/react-router-data';
import { addDays, todayInTz, zonedToUtcIso } from '~/lib/time';

export type BookingDataError = 'invalid-request' | 'room-not-found' | 'availability-unavailable';

export async function loadListingBookingDataRoute(
  request: Request,
  url: URL,
  listingSlug: string,
  groupSlug?: string,
) {
  try {
    const listing = await fetchListing(request, listingSlug);
    if (!listing || (groupSlug !== undefined && listing.group?.slug !== groupSlug)) {
      return bookingDataError('room-not-found', 404);
    }

    return loadListingBookingData(request, listing, url);
  } catch (error) {
    rethrowCriticalDataError(error);
    return bookingDataError('availability-unavailable', 502);
  }
}

export type ListingBookingDataResult = ServerDataFrom<typeof loadListingBookingDataRoute>;

/**
 * Resolves the availability and quote payload used by booking-data resource routes.
 */
export async function loadListingBookingData(
  request: Request,
  listing: PublicListingDetailWithTimezoneResponse,
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

    const timezone = listing.timezone;
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
    const config = dailyModeConfig(listing.modeConfig);
    const durationDays = selectedPackage?.duration ?? 0;
    const fixedPackageRange =
      listing.bookingSelection === 'fixed_packages' &&
      durationDays > 0 &&
      durationDays <= MAX_BOOKING_RANGE_DAYS &&
      canOffsetDateOnly(from, durationDays)
        ? { from, to: addDays(from, durationDays) }
        : null;
    const effectiveTo = fixedPackageRange?.to ?? to;
    const flexibleRange = effectiveTo
      ? eligibleDailyRange(from, effectiveTo, config.minNights, config.maxNights)
      : null;
    const range =
      listing.bookingSelection === 'fixed_packages'
        ? fixedPackageRange && bookingDateRangeSchema.safeParse(fixedPackageRange).success
          ? fixedPackageRange
          : null
        : flexibleRange;
    const openDates = openDailyDates(availability);
    const selectionAvailable = Boolean(
      range &&
      (listing.bookingSelection === 'fixed_packages'
        ? openDates.has(range.from)
        : datesInDailyRange(flexibleRange!).every((dateValue) => openDates.has(dateValue))),
    );
    const selectionStart = selectionAvailable
      ? zonedToUtcIso(range!.from, config.checkinTime, availability.timezone)
      : null;
    const selectionEnd = selectionAvailable
      ? zonedToUtcIso(range!.to, config.checkoutTime, availability.timezone)
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
