import { data } from 'react-router';
import { requireAuth } from '~/lib/auth.server';
import { formRequestFailureStatus, readFormRequestBody } from '~/lib/form-request.server';
import { storefrontPaths } from '~/constants/paths';
import { parseBookingHistoryFilter } from '~/features/account/lib/booking-history';
import { submitBookingCancellation } from '~/features/account/server/booking-cancellation.server';
import { loadAccountBookings } from '~/features/account/server/booking-history.server';
import { submitCustomerReview } from '~/features/account/server/customer-reviews.server';

export async function loadAccountBookingsRoute(request: Request, locale: 'vi' | 'en') {
  const url = new URL(request.url);
  const auth = requireAuth(storefrontPaths.login(locale, `${url.pathname}${url.search}`));
  const filter = parseBookingHistoryFilter(url.searchParams.get('status'));
  const result = await loadAccountBookings(request, auth.session.accessToken, locale, filter);

  return { locale, filter, ...result };
}

export async function handleAccountBookingsAction(request: Request, locale: 'vi' | 'en') {
  const body = await readFormRequestBody(request);
  if (!body.ok) {
    return data(
      {
        ok: false,
        error: body.code,
        bookingCode: '',
        bookingId: null,
      },
      { status: formRequestFailureStatus(body.code) },
    );
  }

  const formData = body.value;
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
