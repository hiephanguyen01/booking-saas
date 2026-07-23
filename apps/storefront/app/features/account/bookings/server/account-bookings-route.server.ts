import { parseBookingHistoryFilter } from '../../lib/booking-history';
import { submitBookingCancellation } from '../../server/booking-cancellation.server';
import { loadAccountBookings } from '../../server/booking-history.server';
import { submitCustomerReview } from '../../server/customer-reviews.server';
import { requireAuth } from '../../../../lib/auth.server';
import { storefrontPaths } from '../../../../lib/locale-paths';

export async function loadAccountBookingsRoute(request: Request, locale: 'vi' | 'en') {
  const url = new URL(request.url);
  const auth = requireAuth(storefrontPaths.login(locale, `${url.pathname}${url.search}`));
  const filter = parseBookingHistoryFilter(url.searchParams.get('status'));
  const result = await loadAccountBookings(request, auth.session.accessToken, locale, filter);

  return { locale, filter, ...result };
}

export async function handleAccountBookingsAction(request: Request, locale: 'vi' | 'en') {
  const formData = await request.formData();

  if (formData.get('intent') === 'cancel') {
    const bookingCode = formData.get('bookingCode');
    return submitBookingCancellation(
      request,
      locale,
      typeof bookingCode === 'string' ? bookingCode : '',
      formData,
    );
  }

  return submitCustomerReview(request, locale, formData);
}
