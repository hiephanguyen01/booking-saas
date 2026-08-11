import {
  customerBookingSettlementResponseSchema,
  openSettlementDisputeInputSchema,
  settlementDisputeResponseSchema,
  type CustomerBookingSettlementResponse,
  type SettlementDisputeResponse,
} from '@booking/contracts';
import { data, redirect } from 'react-router';
import { z } from 'zod';
import {
  DISPUTE_EVIDENCE_MAX,
  DISPUTE_REASON_MAX,
  DISPUTE_REASON_MIN,
} from '~/features/account/lib/booking-dispute';
import { apiGet, apiPost } from '~/lib/server/api.server';
import { requireCustomerAuth } from '~/lib/server/auth.server';
import { checkoutBooking, fetchPaymentOptions } from '~/features/booking/server/booking.server';
import { formRequestFailureStatus, readFormRequestBody } from '~/lib/server/form-request.server';
import { errorStatus } from '~/lib/http-status';
import { storefrontPaths } from '~/constants/paths';
import {
  allowedPaymentFormPost,
  allowedPaymentRedirect,
  isMockPaymentRedirect,
} from '~/features/checkout/server/payment-redirect.server';
import { submitBookingCancellation } from '~/features/account/server/booking-cancellation.server';
import { loadAccountBooking } from '~/features/account/server/booking-history.server';
import { submitCustomerReview } from '~/features/account/server/customer-reviews.server';
import { apiPaths } from '~/constants/api-paths';

const bookingActionSchema = z.discriminatedUnion('intent', [
  z.object({ intent: z.literal('pay') }),
  z.object({
    intent: z.literal('dispute'),
    reason: z
      .string()
      .trim()
      .min(DISPUTE_REASON_MIN, 'DISPUTE_REASON_REQUIRED')
      .max(DISPUTE_REASON_MAX),
    evidence: z.string().max(DISPUTE_EVIDENCE_MAX).optional(),
  }),
]);

/**
 * The dispute dialog posts through its own fetcher, so it needs to recognise
 * its own result: the page-level `actionData` carries the pay/review/cancel
 * replies as well.
 */
export interface BookingDisputeActionData {
  ok: boolean;
  error: string | null;
  intent: 'dispute';
}

export async function loadAccountBookingDetailRoute(
  request: Request,
  code: string,
  locale: 'vi' | 'en',
) {
  const url = new URL(request.url);
  const auth = requireCustomerAuth(request, locale);
  const booking = await loadAccountBooking(request, code, locale, auth.session.accessToken);
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

export async function handleAccountBookingDetailAction(
  request: Request,
  code: string,
  locale: 'vi' | 'en',
) {
  const normalizedCode = code.trim().toUpperCase();
  const body = await readFormRequestBody(request);
  if (!body.ok) {
    return data(
      {
        ok: false,
        error: body.code,
        bookingCode: normalizedCode,
        bookingId: null,
      },
      { status: formRequestFailureStatus(body.code) },
    );
  }

  const formData = body.value;
  if (formData.get('intent') === 'review') {
    return submitCustomerReview(request, locale, formData);
  }
  if (formData.get('intent') === 'cancel') {
    return submitBookingCancellation(request, locale, normalizedCode, formData);
  }

  const auth = requireCustomerAuth(request, locale, { includeSearch: false });
  const isDispute = formData.get('intent') === 'dispute';
  const parsed = bookingActionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return isDispute
      ? data<BookingDisputeActionData>(
          { ok: false, error: 'DISPUTE_REASON_REQUIRED', intent: 'dispute' },
          { status: 400 },
        )
      : data({ ok: false, error: 'CANCEL_REASON_REQUIRED' }, { status: 400 });
  }

  const booking = await loadAccountBooking(
    request,
    normalizedCode,
    locale,
    auth.session.accessToken,
  );
  if (!booking) {
    return isDispute
      ? data<BookingDisputeActionData>(
          { ok: false, error: 'BOOKING_NOT_FOUND', intent: 'dispute' },
          { status: 404 },
        )
      : data({ ok: false, error: 'BOOKING_NOT_FOUND' }, { status: 404 });
  }

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
      return data<BookingDisputeActionData>(
        { ok: false, error: 'DISPUTE_INVALID', intent: 'dispute' },
        { status: 400 },
      );
    }

    const result = await apiPost<SettlementDisputeResponse>(
      request,
      apiPaths.customer.financeDisputes,
      dispute.data,
      auth.session.accessToken,
      { schema: settlementDisputeResponseSchema },
    );
    if (!result.ok) {
      // The envelope's `code` is the only translatable half; `error` is an
      // English backend message that the account UI must never surface.
      return data<BookingDisputeActionData>(
        { ok: false, error: result.code ?? 'DISPUTE_FAILED', intent: 'dispute' },
        { status: errorStatus(result.status) },
      );
    }
    // Data, not a redirect: the dialog's fetcher needs a result to close on, and
    // the fetcher submission revalidates the loader that reloads the settlement.
    return data<BookingDisputeActionData>({ ok: true, error: null, intent: 'dispute' });
  }

  // Two payable shapes: a booking still awaiting its first payment, and a
  // confirmed one that still owes a balance (§8.3). `canPayBalance` is the
  // server's own rule, so this never re-derives it from amounts.
  if (booking.status !== 'pending_payment' && !booking.canPayBalance) {
    return data({ ok: false, error: 'PAYMENT_NOT_AVAILABLE' }, { status: 409 });
  }

  const options = await fetchPaymentOptions(request);
  const result = await checkoutBooking(request, booking.id, options.methods[0], {
    bookingCode: booking.code,
  });
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
