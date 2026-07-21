import type { Route } from './+types/listing-booking-data';
import { fetchListing } from '../lib/catalog.server';
import { bookingDataError, loadListingBookingData } from '../lib/listing-booking-data.server';

export async function loader({ request, params, url }: Route.LoaderArgs) {
  try {
    const listing = await fetchListing(request, params.listingSlug);
    if (!listing) return bookingDataError('room-not-found', 404);

    return loadListingBookingData(request, listing, url);
  } catch {
    return bookingDataError('availability-unavailable', 502);
  }
}
