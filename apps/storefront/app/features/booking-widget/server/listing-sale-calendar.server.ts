import type { AvailabilityMode } from '@booking/contracts';
import { fetchAvailabilityCalendar } from '~/features/booking/server/booking.server';
import { fetchListing } from '~/features/catalog/server/catalog.server';
import { monthBounds } from '~/features/booking-widget/lib/sale-calendar';
import { isAbortLikeError } from '~/lib/server/optional-data.server';
import { selectedPackageForListing } from '~/lib/package-options';
import type { ServerDataFrom } from '~/lib/react-router-data';
import { bookingDataError } from './listing-booking-data.server';

export async function loadListingSaleCalendarRoute(
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

    const requestedMode = url.searchParams.get('mode');
    const mode: Extract<AvailabilityMode, 'hourly' | 'daily'> | null =
      requestedMode === 'hourly' || requestedMode === 'daily' ? requestedMode : null;
    if (!mode || !listing.bookingModes.includes(mode)) {
      return bookingDataError('invalid-request', 400);
    }

    const requestedMonth = url.searchParams.get('month');
    if (!requestedMonth) return bookingDataError('invalid-request', 400);

    let bounds: { from: string; to: string };
    try {
      bounds = monthBounds(requestedMonth);
    } catch {
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

    const calendar = await fetchAvailabilityCalendar(request, listing.slug, {
      mode,
      ...bounds,
      ...(packageId ? { packageId } : {}),
    });

    return {
      ok: true as const,
      mode,
      month: requestedMonth,
      packageId: packageId ?? null,
      calendar,
    };
  } catch (error) {
    if (isAbortLikeError(error)) throw error;
    return bookingDataError('availability-unavailable', 502);
  }
}

export type ListingSaleCalendarResult = ServerDataFrom<typeof loadListingSaleCalendarRoute>;
