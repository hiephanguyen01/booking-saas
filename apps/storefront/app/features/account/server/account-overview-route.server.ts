import {
  bookingResponseSchema,
  customerFavoriteListResponseSchema,
  type BookingResponse,
} from '@booking/contracts';
import { z } from 'zod';
import { apiGet } from '~/lib/server/api.server';
import { requireCustomerAuth } from '~/lib/server/auth.server';
import { apiPaths } from '~/constants/api-paths';
import { bookingVariant } from '~/features/booking/lib/booking-detail-model';

export interface AccountOverviewStats {
  upcoming: number;
  completed: number;
  favorites: number;
}

export async function loadAccountOverviewRoute(request: Request, locale: 'vi' | 'en') {
  const auth = requireCustomerAuth(request, locale);
  const [bookings, favorites] = await Promise.all([
    apiGet<BookingResponse[]>(request, apiPaths.public.myBookings, auth.session.accessToken, {
      schema: z.array(bookingResponseSchema),
    }),
    apiGet(request, apiPaths.customer.favorites, auth.session.accessToken, {
      query: { page: 1, pageSize: 1 },
      schema: customerFavoriteListResponseSchema,
    }),
  ]);

  const stats: AccountOverviewStats | null =
    bookings.ok && favorites.ok && favorites.data
      ? {
          upcoming: (bookings.data ?? []).filter(
            (booking) => bookingVariant(booking.status) === 'upcoming',
          ).length,
          completed: (bookings.data ?? []).filter(
            (booking) => bookingVariant(booking.status) === 'completed',
          ).length,
          favorites: favorites.data.total,
        }
      : null;

  return { locale, stats };
}
