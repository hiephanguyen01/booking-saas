import type { Locale } from '@booking/i18n';
import { data, redirect } from 'react-router';
import {
  cancelBooking,
  checkoutBooking,
  fetchBookingByCode,
  fetchPaymentOptions,
  fetchPaymentStatus,
  mockPay,
  mockPaymentsEnabled,
  verifyBookingAccess,
} from '../../../lib/booking.server';
import { getCheckoutFlowService, maskCheckoutEmail } from '../../../lib/checkout-flow.server';
import { errorStatus } from '../../../lib/http-status';
import { storefrontPaths } from '../../../lib/locale-paths';
import { rethrowCriticalDataError } from '../../../lib/optional-data.server';
import {
  allowedPaymentFormPost,
  allowedPaymentRedirect,
  isMockPaymentRedirect,
} from '../../../lib/payment-redirect.server';

export async function loadBookingDetail(request: Request, code: string) {
  const flow = await getCheckoutFlowService().readForCode(request, code);
  const status = await fetchPaymentStatus(request, code, {
    accessGrant: flow?.accessGrant,
    otp: flow?.legacyOtp,
  });

  if (!status) throw new Response('Booking not found', { status: 404 });

  return {
    code,
    loadedAt: Date.now(),
    status,
    mockEnabled: mockPaymentsEnabled(),
    canRetry: Boolean(flow && status.bookingStatus !== 'expired'),
    listingSlug: flow?.record?.listingSlug ?? null,
    maskedEmail: flow?.record?.maskedEmail ?? null,
  };
}

export async function handleBookingDetailAction(request: Request, code: string, locale: Locale) {
  const form = await request.formData();
  const intent = String(form.get('intent') ?? '');

  if (intent === 'verify-access') {
    return verifyAccess(request, code, locale, form);
  }
  if (intent === 'mock-pay') {
    const flow = await getCheckoutFlowService().readForCode(request, code);
    const result = await mockPay(request, code, {
      accessGrant: flow?.accessGrant,
      otp: flow?.legacyOtp,
    });
    return data(
      { ok: result.ok, error: result.error ?? null },
      { status: result.ok ? 200 : errorStatus(result.status) },
    );
  }
  if (intent === 'retry-payment') {
    return retryPayment(request, code, locale, form);
  }
  if (intent === 'cancel') {
    const flow = await getCheckoutFlowService().readForCode(request, code);
    const otp = String(form.get('otp') ?? '').trim() || flow?.legacyOtp;
    const reason = String(form.get('reason') ?? '').trim() || undefined;
    const result = await cancelBooking(
      request,
      code,
      { reason },
      { accessGrant: flow?.accessGrant, otp },
    );
    return data(
      { ok: result.ok, error: result.error ?? null },
      { status: result.ok ? 200 : errorStatus(result.status) },
    );
  }
  return data({ ok: false, error: 'UNKNOWN_INTENT' }, { status: 400 });
}

async function verifyAccess(request: Request, code: string, locale: Locale, form: FormData) {
  const otp = String(form.get('otp') ?? '').trim();
  if (!otp) return data({ ok: false, error: 'OTP_REQUIRED' }, { status: 400 });

  const verified = await verifyBookingAccess(request, code, otp);
  if (!verified.ok || !verified.data) {
    return data(
      { ok: false, error: verified.code ?? 'INVALID_OTP' },
      { status: errorStatus(verified.status) },
    );
  }

  const booking = verified.data.booking;
  const setCookie = await getCheckoutFlowService().create(
    request,
    {
      bookingId: booking.id,
      bookingCode: booking.code,
      listingSlug: booking.listingSlug,
      locale,
      maskedEmail: maskCheckoutEmail(booking.customer.email),
    },
    verified.data.accessGrant,
  );
  return redirect(storefrontPaths.booking(locale, code), {
    headers: { 'Set-Cookie': setCookie },
  });
}

async function retryPayment(request: Request, code: string, locale: Locale, form: FormData) {
  const flow = await getCheckoutFlowService().readForCode(request, code);
  let bookingId = flow?.record?.bookingId ?? null;
  if (!bookingId) {
    try {
      const owned = await fetchBookingByCode(request, code, {
        accessGrant: flow?.accessGrant,
        otp: String(form.get('otp') ?? '') || flow?.legacyOtp,
      });
      bookingId = owned?.id ?? null;
    } catch (error) {
      rethrowCriticalDataError(error);
      bookingId = null;
    }
  }
  if (!bookingId) {
    return data({ ok: false, error: 'PAYMENT_RETRY_UNAVAILABLE' }, { status: 403 });
  }

  const options = await fetchPaymentOptions(request);
  const checkout = await checkoutBooking(
    request,
    bookingId,
    code,
    options.methods[0],
    flow?.accessGrant,
  );
  const destination = checkout.data?.destination;
  if (
    checkout.ok &&
    destination?.type === 'redirect' &&
    isMockPaymentRedirect(destination.paymentUrl)
  ) {
    return redirect(storefrontPaths.booking(locale, code));
  }
  if (checkout.ok && destination?.type === 'form_post') {
    const handoff = allowedPaymentFormPost(destination);
    if (handoff) return { ok: true, error: null, handoff };
  }

  const paymentUrl =
    destination?.type === 'redirect' ? allowedPaymentRedirect(destination.paymentUrl) : null;
  if (checkout.ok && paymentUrl) return redirect(paymentUrl);

  return data(
    {
      ok: false,
      error:
        checkout.ok && !paymentUrl
          ? 'INVALID_PAYMENT_REDIRECT'
          : (checkout.error ?? checkout.code ?? 'PAYMENT_RETRY_FAILED'),
    },
    { status: checkout.ok ? 502 : errorStatus(checkout.status) },
  );
}
