import { data, redirect } from 'react-router';
import { z } from 'zod';
import {
  customerBookingSettlementResponseSchema,
  openSettlementDisputeInputSchema,
  settlementDisputeResponseSchema,
  type CustomerBookingSettlementResponse,
  type SettlementDisputeResponse,
} from '@booking/contracts';
import { BookingDetailPanel } from '../../features/account/components/booking-detail-panel';
import { PaymentHandoff } from '../../features/checkout/components/payment-handoff';
import { loadAccountBooking } from '../../features/account/server/booking-history.server';
import { cancelBooking, checkoutBooking, fetchPaymentOptions } from '../../lib/booking.server';
import { errorStatus } from '../../lib/http-status';
import { storefrontPaths } from '../../lib/locale-paths';
import {
  allowedPaymentFormPost,
  allowedPaymentRedirect,
  isMockPaymentRedirect,
} from '../../lib/payment-redirect.server';
import { requireAuth } from '../../lib/auth.server';
import { apiGet, apiPost } from '../../lib/api.server';
import type { Route } from './+types/booking-detail';

const bookingActionSchema = z.discriminatedUnion('intent', [
  z.object({ intent: z.literal('pay') }),
  z.object({
    intent: z.literal('cancel'),
    reason: z.string().trim().min(1, 'CANCEL_REASON_REQUIRED').max(500),
  }),
  z.object({
    intent: z.literal('dispute'),
    reason: z.string().trim().min(10, 'DISPUTE_REASON_REQUIRED').max(2000),
    evidence: z.string().max(5000).optional(),
  }),
]);

export function meta() {
  return [{ title: 'Booking history | Bookify' }, { name: 'robots', content: 'noindex' }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const locale = params.locale === 'en' ? 'en' : 'vi';
  const url = new URL(request.url);
  const auth = requireAuth(storefrontPaths.login(locale, `${url.pathname}${url.search}`));
  const booking = await loadAccountBooking(request, params.code, locale);
  if (!booking) throw new Response('Booking not found', { status: 404 });
  let settlement: CustomerBookingSettlementResponse | null = null;
  const response = await apiGet<CustomerBookingSettlementResponse>(
    request,
    `/customer/finance/settlements/${encodeURIComponent(booking.id)}`,
    auth.session.accessToken,
    { schema: customerBookingSettlementResponseSchema },
  );
  if (response.ok) settlement = response.data;
  return {
    locale,
    booking,
    settlement,
    defaultCancelOpen: url.searchParams.get('cancel') === '1',
  };
}

export async function action({ request, params }: Route.ActionArgs) {
  const locale = params.locale === 'en' ? 'en' : 'vi';
  const auth = requireAuth(storefrontPaths.login(locale, new URL(request.url).pathname));
  const formData = await request.formData();
  const parsed = bookingActionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return data({ ok: false, error: 'CANCEL_REASON_REQUIRED' }, { status: 400 });
  }

  const booking = await loadAccountBooking(request, params.code, locale);
  if (!booking) return data({ ok: false, error: 'BOOKING_NOT_FOUND' }, { status: 404 });

  if (parsed.data.intent === 'dispute') {
    const dispute = openSettlementDisputeInputSchema.safeParse({
      bookingId: booking.id,
      reason: parsed.data.reason,
      evidence: (parsed.data.evidence ?? '')
        .split(/\r?\n|,/)
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 10),
    });
    if (!dispute.success) {
      return data({ ok: false, error: 'DISPUTE_INVALID' }, { status: 400 });
    }
    const result = await apiPost<SettlementDisputeResponse>(
      request,
      '/customer/finance/disputes',
      dispute.data,
      auth.session.accessToken,
      { schema: settlementDisputeResponseSchema },
    );
    if (!result.ok) {
      return data(
        { ok: false, error: result.error ?? result.code ?? 'DISPUTE_FAILED' },
        { status: errorStatus(result.status) },
      );
    }
    return redirect(storefrontPaths.account.booking(locale, booking.code));
  }

  if (parsed.data.intent === 'pay') {
    if (booking.status !== 'pending_payment') {
      return data({ ok: false, error: 'PAYMENT_NOT_AVAILABLE' }, { status: 409 });
    }
    const options = await fetchPaymentOptions(request);
    const result = await checkoutBooking(request, booking.id, options.methods[0]);
    const destination = result.data?.destination;
    if (
      result.ok &&
      destination?.type === 'redirect' &&
      isMockPaymentRedirect(destination.paymentUrl)
    ) {
      return redirect(storefrontPaths.booking(locale, booking.code));
    }
    if (result.ok && destination?.type === 'form_post') {
      const handoff = allowedPaymentFormPost(destination);
      if (handoff) return { ok: true, error: null, handoff };
    }
    const paymentUrl =
      destination?.type === 'redirect' ? allowedPaymentRedirect(destination.paymentUrl) : null;
    if (result.ok && paymentUrl) return redirect(paymentUrl);
    return data(
      {
        ok: false,
        error:
          result.ok && !paymentUrl
            ? 'INVALID_PAYMENT_REDIRECT'
            : (result.error ?? result.code ?? 'PAYMENT_FAILED'),
      },
      { status: result.ok ? 502 : errorStatus(result.status) },
    );
  }

  if (booking.status !== 'confirmed') {
    return data({ ok: false, error: 'CANCELLATION_NOT_AVAILABLE' }, { status: 409 });
  }
  const result = await cancelBooking(request, booking.code, { reason: parsed.data.reason });
  if (!result.ok) {
    return data(
      { ok: false, error: result.error ?? result.code ?? 'CANCELLATION_FAILED' },
      { status: errorStatus(result.status) },
    );
  }
  return redirect(storefrontPaths.account.booking(locale, booking.code));
}

export default function AccountBookingDetail({ loaderData, actionData }: Route.ComponentProps) {
  if (actionData && 'handoff' in actionData && actionData.handoff) {
    return <PaymentHandoff destination={actionData.handoff} />;
  }
  const locale = loaderData.locale === 'en' ? 'en' : 'vi';
  return (
    <BookingDetailPanel
      booking={loaderData.booking}
      locale={locale}
      defaultCancelOpen={loaderData.defaultCancelOpen}
      actionError={actionData && !actionData.ok ? actionData.error : null}
      settlement={loaderData.settlement}
    />
  );
}
