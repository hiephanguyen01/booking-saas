import type { Route } from './+types/bookings';
import { fetchBookingList } from '~/features/bookings/booking-list.server';
import { parseBookingStatus } from '~/features/bookings/booking-list.query';
import { requireTenant } from '../tenant.server';

export async function loader({ request, url }: Route.LoaderArgs) {
  const { auth } = await requireTenant(request, 'tenant.bookings.read');
  const data = await fetchBookingList(auth, parseBookingStatus(url.searchParams.get('status')), request.signal);
  return Response.json(data, {
    headers: {
      'Cache-Control': 'private, no-store',
      Vary: 'Cookie',
    },
  });
}
