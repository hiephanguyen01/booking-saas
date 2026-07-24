import { data } from 'react-router';
import { fetchPaymentStatus } from '../lib/booking.server';
import { getCheckoutFlowService } from '../lib/checkout-flow.server';
import type { Route } from './+types/booking-payment-status';

/** Lightweight polling endpoint for the booking confirmation screen. */
export async function loader({ request, params }: Route.LoaderArgs) {
  const [status, flow] = await Promise.all([
    fetchPaymentStatus(request, params.code),
    getCheckoutFlowService().readForCode(request, params.code),
  ]);

  if (!status) throw new Response('Booking not found', { status: 404 });

  const payload = {
    ok: true as const,
    loadedAt: Date.now(),
    status,
    canRetry: Boolean(flow && status.bookingStatus !== 'expired'),
    listingSlug: flow?.record.listingSlug ?? null,
    maskedEmail: flow?.record.maskedEmail ?? null,
  };
  const headers = new Headers({ 'Cache-Control': 'no-store' });

  if (status.paymentStatus === 'succeeded' && flow) {
    headers.append('Set-Cookie', await getCheckoutFlowService().destroy(request));
  }

  return data(payload, { headers });
}
