import { data } from 'react-router';
import { z } from 'zod';
import { requireCustomerAuth } from '~/lib/server/auth.server';
import { cancelBooking } from '~/features/booking/server/booking.server';
import { formRequestFailureStatus, readFormRequestBody } from '~/lib/server/form-request.server';
import { errorStatus } from '~/lib/http-status';
import { loadAccountBooking } from './booking-history.server';

const cancellationSchema = z.object({
  reason: z.string().trim().min(1, 'CANCEL_REASON_REQUIRED').max(500),
});

export interface BookingCancellationActionData {
  ok: boolean;
  error: string | null;
  bookingCode: string;
}

export async function submitBookingCancellation(
  request: Request,
  locale: 'vi' | 'en',
  bookingCode: string,
  formData?: FormData,
) {
  const normalizedCode = bookingCode.trim().toUpperCase();
  const body = formData
    ? ({ ok: true, value: formData } as const)
    : await readFormRequestBody(request);
  if (!body.ok) {
    return data<BookingCancellationActionData>(
      { ok: false, error: body.code, bookingCode: normalizedCode },
      { status: formRequestFailureStatus(body.code) },
    );
  }

  const auth = requireCustomerAuth(request, locale, { includeSearch: false });
  const parsed = cancellationSchema.safeParse({ reason: body.value.get('reason') });

  if (!normalizedCode || !parsed.success) {
    return data<BookingCancellationActionData>(
      { ok: false, error: 'CANCEL_REASON_REQUIRED', bookingCode: normalizedCode },
      { status: 400 },
    );
  }

  const booking = await loadAccountBooking(
    request,
    normalizedCode,
    locale,
    auth.session.accessToken,
  );
  if (!booking) {
    return data<BookingCancellationActionData>(
      { ok: false, error: 'BOOKING_NOT_FOUND', bookingCode: normalizedCode },
      { status: 404 },
    );
  }
  if (booking.status !== 'confirmed') {
    return data<BookingCancellationActionData>(
      { ok: false, error: 'CANCELLATION_NOT_AVAILABLE', bookingCode: booking.code },
      { status: 409 },
    );
  }

  const result = await cancelBooking(request, booking.code, { reason: parsed.data.reason });
  if (!result.ok) {
    return data<BookingCancellationActionData>(
      {
        ok: false,
        error: result.error ?? result.code ?? 'CANCELLATION_FAILED',
        bookingCode: booking.code,
      },
      { status: errorStatus(result.status) },
    );
  }

  return data<BookingCancellationActionData>({
    ok: true,
    error: null,
    bookingCode: booking.code,
  });
}
