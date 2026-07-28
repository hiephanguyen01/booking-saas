import type { Route } from './+types/listing-booking-data';
import { loadListingBookingDataRoute } from '~/features/booking-widget/server/listing-booking-data.server';

export async function loader({ request, params, url }: Route.LoaderArgs) {
  return loadListingBookingDataRoute(request, url, params.listingSlug);
}
