import {
  createBookingInputSchema,
  customerPaymentMethodSchema,
  guestInfoSchema,
  type ValidatePromoResponse,
} from '@booking/contracts';
import { localeTranslator } from '~/lib/translator';
import type { Locale } from '@booking/i18n';
import { data, redirect } from 'react-router';
import { readRefCode } from '~/features/affiliate/server/affiliate.server';
import { getOptionalAuth } from '~/lib/server/auth.server';
import {
  checkoutBooking,
  createBooking,
  fetchPaymentOptions,
  validatePromo,
} from '~/features/booking/server/booking.server';
import { fetchListing, fetchQuote } from '~/features/catalog/server/catalog.server';
import {
  buildCheckoutIdempotencyKey,
  createCheckoutAttemptId,
  parseCheckoutAttemptId,
} from '~/features/checkout/server/checkout-idempotency.server';
import {
  getCheckoutFlowService,
  maskCheckoutEmail,
} from '~/features/checkout/server/checkout-flow.server';
import { formRequestFailureStatus, readFormRequestBody } from '~/lib/server/form-request.server';
import { errorStatus } from '~/lib/http-status';
import { storefrontPaths } from '~/constants/paths';
import {
  allowedPaymentFormPost,
  allowedPaymentRedirect,
  isMockPaymentRedirect,
} from '~/features/checkout/server/payment-redirect.server';
import { appendRecentCookie } from '~/features/account/server/recent.server';
import { getCurrentStorefrontTenant } from '~/lib/server/request-context.server';

const CHECKOUT_MAX_FORM_BYTES = 64 * 1024;

/** Backend codes meaning the chosen slot or package is gone — the form re-opens the picker. */
const BOOKING_SELECTION_ERRORS = new Set([
  'PACKAGE_UNAVAILABLE',
  'PACKAGE_DURATION_MISMATCH',
  'SLOT_TAKEN',
  'SLOT_HELD',
]);

/**
 * Every checkout failure answers with the same four fields, because the form reads
 * all of them on every render — `checkoutAttemptId` in particular has to survive a
 * failed submit or the retry would mint a new idempotency key and risk a double
 * booking. Building the payload in one place is what keeps that guarantee visible.
 */
function checkoutFailure(
  { status, headers }: { status: number; headers?: Headers },
  payload: {
    fieldErrors?: Record<string, string[] | undefined> | null;
    error: string | null | undefined;
    code: string | null | undefined;
    checkoutAttemptId: string;
  },
) {
  return data(
    {
      fieldErrors: payload.fieldErrors ?? null,
      error: payload.error,
      code: payload.code,
      checkoutAttemptId: payload.checkoutAttemptId,
    },
    headers ? { status, headers } : { status },
  );
}

export async function loadCheckout(request: Request, url: URL, locale: Locale) {
  const searchParams = url.searchParams;
  const slug = searchParams.get('listing');
  const mode = searchParams.get('mode');
  const start = searchParams.get('start');
  const end = searchParams.get('end');
  const qty = searchParams.get('qty') || '1';
  const packageId = searchParams.get('packageId') ?? undefined;
  const promoCode = searchParams.get('promo')?.trim().toUpperCase() || null;

  if (!slug || !mode || !start || !end) {
    throw redirect(slug ? storefrontPaths.listing(locale, slug) : storefrontPaths.home(locale));
  }

  const [listing, quote, paymentOptions] = await Promise.all([
    fetchListing(request, slug),
    fetchQuote(
      request,
      slug,
      new URLSearchParams({
        mode,
        from: start,
        to: end,
        quantity: qty,
        ...(packageId ? { packageId } : {}),
      }),
    ),
    fetchPaymentOptions(request),
  ]);

  if (!listing) throw redirect(storefrontPaths.home(locale));
  if (!quote) throw redirect(storefrontPaths.listing(locale, slug));

  let promo: ValidatePromoResponse | null = null;
  if (promoCode) {
    const result = await validatePromo(request, {
      code: promoCode,
      listingId: listing.id,
      amount: quote.subtotal,
      start,
      end,
    });
    promo = result.data;
  }

  return {
    listing,
    mode,
    start,
    end,
    qty,
    packageId: packageId ?? null,
    quote,
    promoCode,
    promo,
    currentUser: getOptionalAuth()?.info.user ?? null,
    paymentMethods: paymentOptions.methods,
    checkoutAttemptId: createCheckoutAttemptId(),
  };
}

export async function handleCheckoutAction(request: Request, locale: Locale) {
  const t = localeTranslator(locale).t;
  const formBody = await readFormRequestBody(request, CHECKOUT_MAX_FORM_BYTES);
  if (!formBody.ok) {
    return checkoutFailure(
      { status: formRequestFailureStatus(formBody.code) },
      {
        error: t('checkout.bookingFailed'),
        code: formBody.code,
        checkoutAttemptId: createCheckoutAttemptId(),
      },
    );
  }
  const form = formBody.value;
  const checkoutAttemptId =
    parseCheckoutAttemptId(form.get('checkoutAttemptId')) ?? createCheckoutAttemptId();
  const paymentMethod = customerPaymentMethodSchema.safeParse(form.get('paymentMethod'));
  const listingId = String(form.get('listingId') ?? '');
  const mode = String(form.get('mode') ?? '');
  const start = String(form.get('start') ?? '');
  const end = String(form.get('end') ?? '');
  const qty = Number(form.get('qty') ?? '1');
  const promoCode =
    String(form.get('promoCode') ?? '')
      .trim()
      .toUpperCase() || undefined;
  const note = String(form.get('customerNote') ?? '').trim() || undefined;
  const expectedSubtotal = String(form.get('expectedSubtotal') ?? '');
  const packageId = String(form.get('packageId') ?? '') || undefined;
  const guest = guestInfoSchema.safeParse({
    fullName: String(form.get('fullName') ?? '').trim(),
    email: String(form.get('email') ?? '').trim(),
    phone: String(form.get('phone') ?? '').trim(),
  });

  if (!guest.success || !paymentMethod.success) {
    return checkoutFailure(
      { status: 400 },
      {
        fieldErrors: guest.success ? null : guest.error.flatten().fieldErrors,
        error: paymentMethod.success ? null : 'PAYMENT_METHOD_UNAVAILABLE',
        code: paymentMethod.success ? null : 'PAYMENT_METHOD_UNAVAILABLE',
        checkoutAttemptId,
      },
    );
  }

  const tenant = getCurrentStorefrontTenant();
  const auth = getOptionalAuth();
  const refCode = (await readRefCode(request, tenant.id)) ?? undefined;
  const parsed = createBookingInputSchema.safeParse({
    listingId,
    mode,
    from: start,
    to: end,
    quantity: qty,
    expectedSubtotal,
    packageId,
    guestCount: 1,
    customerNote: note,
    guest: guest.data,
    promoCode,
    refCode,
  });

  if (!parsed.success) {
    return checkoutFailure(
      { status: 400 },
      { error: 'INVALID_CHECKOUT_INPUT', code: 'INVALID_CHECKOUT_INPUT', checkoutAttemptId },
    );
  }

  const input = parsed.data;
  const idempotencyKey = buildCheckoutIdempotencyKey({
    tenantId: tenant.id,
    attemptId: checkoutAttemptId,
  });
  const created = await createBooking(request, input, idempotencyKey);

  if (!created.ok || !created.data) {
    // A selection that lost its slot or package is surfaced verbatim so the form can
    // point the customer back at the picker; anything else reads as a generic failure.
    const bookingSelectionError = BOOKING_SELECTION_ERRORS.has(created.code ?? '');
    return checkoutFailure(
      { status: errorStatus(created.status) },
      {
        error: bookingSelectionError ? created.code : t('checkout.bookingFailed'),
        code: created.code,
        checkoutAttemptId,
      },
    );
  }

  const booking = created.data;
  const accessGrant = booking.accessGrant ?? undefined;
  const headers = new Headers();
  headers.append('Set-Cookie', await appendRecentCookie(request, booking.code));
  headers.append(
    'Set-Cookie',
    await getCheckoutFlowService().create(
      request,
      {
        bookingId: booking.id,
        bookingCode: booking.code,
        listingSlug: String(form.get('listingSlug') ?? ''),
        locale,
        maskedEmail: maskCheckoutEmail(guest.data.email),
        paymentMethod: paymentMethod.data,
      },
      accessGrant,
    ),
  );

  // Fail closed when an anonymous booking was created but the API could not
  // persist its access grant. The recent-code cookie lets the customer recover
  // through the OTP lookup flow without making an unauthorized payment call.
  if (!auth && !accessGrant) {
    return redirect(storefrontPaths.bookings(locale), { headers });
  }

  if (booking.status !== 'pending_payment') {
    return redirect(storefrontPaths.booking(locale, booking.code), { headers });
  }

  const checkout = await checkoutBooking(request, booking.id, paymentMethod.data, {
    bookingCode: booking.code,
    accessGrant,
  });
  if (!checkout.ok) {
    return checkoutFailure(
      { status: errorStatus(checkout.status), headers },
      {
        fieldErrors: checkout.fieldErrors ?? null,
        error: t('checkout.paymentFailed'),
        code: checkout.code,
        checkoutAttemptId,
      },
    );
  }

  const destination = checkout.data?.destination;
  if (destination?.type === 'redirect' && isMockPaymentRedirect(destination.paymentUrl)) {
    return redirect(storefrontPaths.booking(locale, booking.code), { headers });
  }
  if (destination?.type === 'form_post') {
    const handoff = allowedPaymentFormPost(destination);
    if (handoff) {
      return data(
        { fieldErrors: null, error: null, code: null, handoff, checkoutAttemptId },
        { status: 200, headers },
      );
    }
  }

  const paymentUrl =
    destination?.type === 'redirect' ? allowedPaymentRedirect(destination.paymentUrl) : null;
  if (!paymentUrl) {
    return checkoutFailure(
      { status: 502, headers },
      {
        error: t('checkout.paymentFailed'),
        code: 'INVALID_PAYMENT_REDIRECT',
        checkoutAttemptId,
      },
    );
  }

  return redirect(paymentUrl, { headers });
}
