import type { Route } from './+types/listing-sale-calendar';
import { loadListingSaleCalendarRoute } from '~/features/booking-widget/server/listing-sale-calendar.server';

export async function loader({ request, params, url }: Route.LoaderArgs) {
  return loadListingSaleCalendarRoute(request, url, params.listingSlug);
}
