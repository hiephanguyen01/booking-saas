import { data } from 'react-router';
import { getCheckoutFlowService } from '~/features/checkout/server/checkout-flow.server';
import type { ServerDataFrom } from '~/lib/react-router-data';
import { fetchPaymentStatus } from './booking.server';

/** Lightweight polling payload for the booking confirmation screen. */
export async function loadBookingPaymentStatusRoute(request: Request, code: string) {
  const flow = await getCheckoutFlowService().readForCode(request, code);
  const status = await fetchPaymentStatus(request, code, {
    accessGrant: flow?.accessGrant,
    otp: flow?.legacyOtp,
  });

  if (!status) throw new Response('Booking not found', { status: 404 });

  const payload = {
    ok: true as const,
    loadedAt: Date.now(),
    status,
    canRetry: Boolean(flow && status.bookingStatus === 'pending_payment'),
    listingSlug: flow?.record?.listingSlug ?? null,
    maskedEmail: flow?.record?.maskedEmail ?? null,
  };
  const headers = new Headers({ 'Cache-Control': 'no-store' });

  if (status.paymentStatus === 'succeeded' && flow) {
    headers.append('Set-Cookie', await getCheckoutFlowService().destroy(request, code));
  }

  return data(payload, { headers });
}

export type BookingPaymentStatusResult = ServerDataFrom<typeof loadBookingPaymentStatusRoute>;
