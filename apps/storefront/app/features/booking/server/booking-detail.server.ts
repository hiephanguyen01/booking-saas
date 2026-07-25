import { customerPaymentMethodSchema } from '@booking/contracts';
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
} from '../../../lib/booking.server';
import { getCheckoutFlowService } from '../../../lib/checkout-flow.server';
import { errorStatus } from '../../../lib/http-status';
import { storefrontPaths } from '../../../lib/locale-paths';
import { optionalData, rethrowCriticalDataError } from '../../../lib/optional-data.server';
import {
  allowedPaymentFormPost,
  allowedPaymentRedirect,
  isMockPaymentRedirect,
} from '../../../lib/payment-redirect.server';

export async function loadBookingDetail(request: Request, code: string) {
  const [status, flow] = await Promise.all([
    fetchPaymentStatus(request, code),
    getCheckoutFlowService().readForCode(request, code),
  ]);

  // `payment-status` is public and only 404s when no booking with this code
  // exists for the tenant — an unknown code is a real not-found, never a
  // payment still in flight.
  if (!status) throw new Response('Booking not found', { status: 404 });

  const payload = {
    code,
    loadedAt: Date.now(),
    status,
    mockEnabled: mockPaymentsEnabled(),
    canRetry: Boolean(flow && status.bookingStatus !== 'expired'),
    listingSlug: flow?.record.listingSlug ?? null,
    maskedEmail: flow?.record.maskedEmail ?? null,
  };
  if (status.paymentStatus === 'succeeded' && flow) {
    return data(payload, {
      headers: { 'Set-Cookie': await getCheckoutFlowService().destroy(request) },
    });
  }
  return payload;
}

export async function handleBookingDetailAction(request: Request, code: string, locale: Locale) {
  const form = await request.formData();
  const intent = String(form.get('intent') ?? '');

  if (intent === 'verify-access') {
    return verifyAccess(request, code, locale, form);
  }
  if (intent === 'mock-pay') {
    const result = await mockPay(request, code);
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
    const otp = String(form.get('otp') ?? '').trim() || flow?.record.otp;
    const reason = String(form.get('reason') ?? '').trim() || undefined;
    const result = await cancelBooking(request, code, { reason, otp });
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
  const booking = await optionalData(fetchBookingByCode(request, code, otp), null);
  if (!booking) return data({ ok: false, error: 'INVALID_OTP' }, { status: 403 });

  const setCookie = await getCheckoutFlowService().create(request, {
    bookingId: booking.id,
    bookingCode: booking.code,
    listingSlug: '',
    locale,
    otp,
  });
  return redirect(storefrontPaths.booking(locale, code), {
    headers: { 'Set-Cookie': setCookie },
  });
}

async function retryPayment(request: Request, code: string, locale: Locale, form: FormData) {
  const flow = await getCheckoutFlowService().readForCode(request, code);
  let bookingId = flow?.record.bookingId ?? null;
  if (!bookingId) {
    try {
      const owned = await fetchBookingByCode(
        request,
        code,
        String(form.get('otp') ?? '') || undefined,
      );
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
  const hasStoredPaymentMethod = flow?.record.paymentMethod !== undefined;
  const storedPaymentMethod = customerPaymentMethodSchema.safeParse(flow?.record.paymentMethod);
  const paymentMethod =
    storedPaymentMethod.success && options.methods.includes(storedPaymentMethod.data)
      ? storedPaymentMethod.data
      : !hasStoredPaymentMethod && options.methods.length === 1
        ? options.methods[0]!
        : null;

  if (!paymentMethod) {
    return data(
      {
        ok: false,
        error: hasStoredPaymentMethod
          ? 'PAYMENT_METHOD_UNAVAILABLE'
          : 'PAYMENT_METHOD_SELECTION_REQUIRED',
      },
      { status: 409 },
    );
  }

  const checkout = await checkoutBooking(request, bookingId, paymentMethod);
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
