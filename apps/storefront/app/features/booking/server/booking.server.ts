import type { ApiResult } from '@booking/api-client';
import type {
  AvailabilityMode,
  AvailabilityResponse,
  BookingAccessResponse,
  BookingOtpResponse,
  BookingResponse,
  CancelBookingResponse,
  CheckoutResponse,
  CreateBookingInput,
  CreateBookingResponse,
  CustomerPaymentMethod,
  PaymentStatusResponse,
  PublicPaymentOptions,
  StorefrontPromotionsInput,
  StorefrontPromotionsResponse,
  ValidatePromoResponse,
} from '@booking/contracts';
import {
  availabilityResponseSchema,
  bookingAccessResponseSchema,
  bookingOtpResponseSchema,
  bookingResponseSchema,
  cancelBookingResponseSchema,
  checkoutResponseSchema,
  createBookingResponseSchema,
  paymentStatusResponseSchema,
  publicPaymentOptionsSchema,
  storefrontPromotionsResponseSchema,
  validatePromoResponseSchema,
} from '@booking/contracts';
import { optionalAuthPost, publicGetData } from '~/lib/server/api.server';
import { storefrontEnv } from '~/lib/server/env.server';

interface BookingAccessHeaders {
  accessGrant?: string;
  otp?: string;
}

interface CheckoutAccessHeaders extends BookingAccessHeaders {
  bookingCode?: string;
}

function accessHeaders(access: BookingAccessHeaders = {}): Record<string, string> {
  return {
    ...(access.accessGrant ? { 'x-booking-access-grant': access.accessGrant } : {}),
    ...(access.otp ? { 'x-booking-otp': access.otp } : {}),
  };
}

/**
 * Server-only booking BFF (§20): the storefront never calls the API from the
 * browser. GET reads preserve HTTP failure semantics; mutations return a
 * structured `ApiResult` so routes can surface field errors and stable
 * problem messages instead of throwing.
 */
// ── Availability (§9) ──────────────────────────────────────────────────────────

export function fetchAvailability(
  request: Request,
  slug: string,
  query: { mode: AvailabilityMode; from: string; to: string; packageId?: string },
): Promise<AvailabilityResponse> {
  const qs = new URLSearchParams(query).toString();
  return publicGetData(request, `/public/listings/${encodeURIComponent(slug)}/availability?${qs}`, {
    schema: availabilityResponseSchema,
  });
}

// ── Promotions (§12.3) ──────────────────────────────────────────────────────────

export function validatePromo(
  request: Request,
  input: { code: string; listingId: string; amount: string; start?: string; end?: string },
): Promise<ApiResult<ValidatePromoResponse>> {
  return optionalAuthPost(request, '/public/checkout/validate-promo', input, {
    schema: validatePromoResponseSchema,
  });
}

export function fetchStorefrontPromotions(
  request: Request,
  input: StorefrontPromotionsInput,
): Promise<ApiResult<StorefrontPromotionsResponse>> {
  return optionalAuthPost(request, '/public/checkout/promotions', input, {
    schema: storefrontPromotionsResponseSchema,
  });
}

// ── Bookings (§8) ───────────────────────────────────────────────────────────────

export function createBooking(
  request: Request,
  input: CreateBookingInput,
  idempotencyKey: string,
): Promise<ApiResult<CreateBookingResponse>> {
  return optionalAuthPost(request, '/public/bookings', input, {
    headers: { 'idempotency-key': idempotencyKey },
    schema: createBookingResponseSchema,
  });
}

export function checkoutBooking(
  request: Request,
  bookingId: string,
  paymentMethod: CustomerPaymentMethod | undefined,
  access: CheckoutAccessHeaders = {},
): Promise<ApiResult<CheckoutResponse>> {
  // Retry flows may load tenant payment options dynamically. Never send an
  // invalid `{ paymentMethod: undefined }` request when no option is configured.
  if (!paymentMethod) {
    return Promise.resolve({
      ok: false,
      status: 409,
      data: null,
      code: 'PAYMENT_METHOD_UNAVAILABLE',
      error: 'PAYMENT_METHOD_UNAVAILABLE',
    });
  }

  return optionalAuthPost(
    request,
    `/public/bookings/${encodeURIComponent(bookingId)}/checkout`,
    { paymentMethod },
    {
      headers: {
        ...(access.bookingCode ? { 'x-booking-code': access.bookingCode } : {}),
        ...accessHeaders(access),
      },
      schema: checkoutResponseSchema,
    },
  );
}

export function fetchPaymentOptions(request: Request): Promise<PublicPaymentOptions> {
  return publicGetData(request, '/public/payment-options', {
    schema: publicPaymentOptionsSchema,
  });
}

export function fetchBookingByCode(
  request: Request,
  code: string,
  access: BookingAccessHeaders = {},
): Promise<BookingResponse | null> {
  return publicGetData(request, `/public/bookings/${encodeURIComponent(code)}`, {
    headers: accessHeaders(access),
    schema: bookingResponseSchema,
    allowNotFound: true,
  });
}

export function requestBookingOtp(
  request: Request,
  code: string,
): Promise<ApiResult<BookingOtpResponse>> {
  return optionalAuthPost(
    request,
    `/public/bookings/${encodeURIComponent(code)}/request-otp`,
    {},
    { schema: bookingOtpResponseSchema },
  );
}

export function verifyBookingAccess(
  request: Request,
  code: string,
  otp: string,
): Promise<ApiResult<BookingAccessResponse>> {
  return optionalAuthPost(
    request,
    `/public/bookings/${encodeURIComponent(code)}/verify-access`,
    { otp },
    { schema: bookingAccessResponseSchema },
  );
}

export function cancelBooking(
  request: Request,
  code: string,
  body: { reason?: string },
  access: BookingAccessHeaders = {},
): Promise<ApiResult<CancelBookingResponse>> {
  return optionalAuthPost(request, `/public/bookings/${encodeURIComponent(code)}/cancel`, body, {
    headers: accessHeaders(access),
    schema: cancelBookingResponseSchema,
  });
}

// ── Payments (§11) ──────────────────────────────────────────────────────────────

export function fetchPaymentStatus(
  request: Request,
  code: string,
  access: BookingAccessHeaders = {},
): Promise<PaymentStatusResponse | null> {
  return publicGetData(request, `/public/bookings/${encodeURIComponent(code)}/payment-status`, {
    headers: accessHeaders(access),
    schema: paymentStatusResponseSchema,
    allowNotFound: true,
  });
}

/** Dev-only mock payment (gated behind `ALLOW_MOCK_PAYMENTS` on the API). */
export function mockPay(
  request: Request,
  code: string,
  access: BookingAccessHeaders = {},
): Promise<ApiResult<BookingResponse>> {
  return optionalAuthPost(
    request,
    `/public/bookings/${encodeURIComponent(code)}/mock-pay`,
    {},
    { headers: accessHeaders(access), schema: bookingResponseSchema },
  );
}

/** Exposed to routes so the confirmation page can render the dev mock-pay button. */
export function mockPaymentsEnabled(): boolean {
  return storefrontEnv.allowMockPayments;
}
