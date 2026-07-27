import type { Route } from './+types/listing-group-booking-data';
import { fetchListing } from '../lib/catalog.server';
import { bookingDataError, loadListingBookingData } from '../lib/listing-booking-data.server';
import { rethrowCriticalDataError } from '../lib/optional-data.server';

export async function loader({ request, params, url }: Route.LoaderArgs) {
  try {
    const listing = await fetchListing(request, params.listingSlug);
    if (!listing || listing.group?.slug !== params.groupSlug) {
      return bookingDataError('room-not-found', 404);
    }
    return loadListingBookingData(request, listing, url);
  } catch (error) {
    rethrowCriticalDataError(error);
    return bookingDataError('availability-unavailable', 502);
  }
}
