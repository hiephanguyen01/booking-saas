import { customerPaymentMethodSchema, type PublicListingResponse } from '@booking/contracts';
import type { Locale } from '@booking/i18n';
import { data, redirect } from 'react-router';
import { getOptionalAuth } from '~/lib/server/auth.server';
import {
  cancelBooking,
  checkoutBooking,
  fetchBookingByCode,
  fetchPaymentOptions,
  fetchPaymentStatus,
  mockPay,
  mockPaymentsEnabled,
  verifyBookingAccess,
} from '~/features/booking/server/booking.server';
import {
  getCheckoutFlowService,
  maskCheckoutEmail,
} from '~/features/checkout/server/checkout-flow.server';
import { formRequestFailureStatus, readFormRequestBody } from '~/lib/server/form-request.server';
import { errorStatus } from '~/lib/http-status';
import { storefrontPaths } from '~/constants/paths';
import { rethrowCriticalDataError } from '~/lib/server/optional-data.server';
import { toBookingDetailViewModel } from '~/features/booking/lib/booking-detail-model';
import {
  allowedPaymentFormPost,
  allowedPaymentRedirect,
  isMockPaymentRedirect,
} from '~/features/checkout/server/payment-redirect.server';
import { fetchListing, fetchListings } from '~/features/catalog/server/catalog.server';

const BOOKING_DETAIL_MAX_FORM_BYTES = 16 * 1024;

export async function loadBookingDetail(request: Request, code: string, locale: Locale) {
  const flowService = getCheckoutFlowService();
  const flow = await flowService.readForCode(request, code);
  const auth = getOptionalAuth();
  if (!auth && !flow?.accessGrant && !flow?.legacyOtp) {
    throw redirect(storefrontPaths.bookings(locale));
  }

  let status;
  try {
    status = await fetchPaymentStatus(request, code, {
      accessGrant: flow?.accessGrant,
      otp: flow?.legacyOtp,
    });
  } catch (error) {
    if (!auth && error instanceof Response && (error.status === 401 || error.status === 403)) {
      throw redirect(storefrontPaths.bookings(locale), {
        headers: flow ? { 'Set-Cookie': await flowService.destroy(request, code) } : undefined,
      });
    }
    throw error;
  }

  if (!status) throw new Response('Booking not found', { status: 404 });

  /**
   * The full booking, on the same access the payment status already used — the
   * endpoint is `@Public()` but resolves through `resolveBookingAccess`, so a
   * grant, an OTP or the customer's own session is still required.
   *
   * Optional on purpose: the payment status is what this page exists to report,
   * so a detail lookup that fails should degrade to the summary rather than take
   * the whole screen down with it.
   */
  let booking = null;
  try {
    booking = await fetchBookingByCode(request, code, {
      accessGrant: flow?.accessGrant,
      otp: flow?.legacyOtp,
    });
  } catch (error) {
    rethrowCriticalDataError(error);
  }

  let recommendations: PublicListingResponse[] = [];
  const bookingSucceeded =
    status.paymentStatus === 'succeeded' ||
    booking?.status === 'confirmed' ||
    booking?.status === 'completed';
  if (booking && bookingSucceeded) {
    try {
      const bookedListing = await fetchListing(request, booking.listingSlug);
      if (!bookedListing) throw new Error('Booked listing unavailable');
      const candidates = await fetchListings(
        request,
        new URLSearchParams({
          type: bookedListing.listingTypeSlug,
          pageSize: '12',
          sort: 'bookings-desc',
        }),
      );
      recommendations = candidates
        .filter((candidate) => candidate.slug !== booking?.listingSlug)
        .slice(0, 6);
    } catch {
      // Recommendations are supplementary; payment outcome must remain available.
      recommendations = [];
    }
  }

  const payload = {
    code,
    loadedAt: Date.now(),
    status,
    booking: booking ? toBookingDetailViewModel(booking, locale) : null,
    mockEnabled: mockPaymentsEnabled(),
    canRetry: Boolean(flow && status.bookingStatus === 'pending_payment'),
    listingSlug: flow?.record?.listingSlug ?? null,
    maskedEmail: flow?.record?.maskedEmail ?? null,
    recommendations,
  };
  // A signed-in customer no longer needs the checkout access grant. Guests do:
  // the success CTA opens the same protected booking at `?view=detail`, so its
  // booking-scoped grant stays alive until the checkout-flow cookie expires.
  if (status.paymentStatus === 'succeeded' && flow && auth) {
    return data(payload, {
      headers: { 'Set-Cookie': await flowService.destroy(request, code) },
    });
  }
  return payload;
}

export async function handleBookingDetailAction(request: Request, code: string, locale: Locale) {
  const formBody = await readFormRequestBody(request, BOOKING_DETAIL_MAX_FORM_BYTES);
  if (!formBody.ok) {
    return data(
      { ok: false, error: formBody.code },
      { status: formRequestFailureStatus(formBody.code) },
    );
  }
  const form = formBody.value;
  const intent = String(form.get('intent') ?? '');

  if (intent === 'verify-access') {
    return verifyAccess(request, code, locale, form);
  }
  if (intent === 'mock-pay') {
    if (!mockPaymentsEnabled()) {
      return data({ ok: false, error: 'NOT_FOUND' }, { status: 404 });
    }
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
  const otp = String(form.get('otp') ?? '').trim() || flow?.legacyOtp;
  let bookingId = flow?.record?.bookingId ?? null;
  if (!bookingId) {
    try {
      const owned = await fetchBookingByCode(request, code, {
        accessGrant: flow?.accessGrant,
        otp,
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
  const hasStoredPaymentMethod = flow?.record?.paymentMethod !== undefined;
  const storedPaymentMethod = customerPaymentMethodSchema.safeParse(flow?.record?.paymentMethod);
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

  const checkout = await checkoutBooking(request, bookingId, paymentMethod, {
    bookingCode: code,
    accessGrant: flow?.accessGrant,
    otp,
  });
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
