import type { ApiResult } from '@booking/api-client';
import type {
  AutoCampaignResponse,
  AvailabilityMode,
  AvailabilityResponse,
  BookingOtpResponse,
  BookingResponse,
  CancelBookingResponse,
  CheckoutResponse,
  CreateBookingInput,
  PaymentStatusResponse,
  ValidatePromoResponse,
} from '@booking/contracts';
import {
  autoCampaignResponseSchema,
  availabilityResponseSchema,
  bookingOtpResponseSchema,
  bookingResponseSchema,
  cancelBookingResponseSchema,
  checkoutResponseSchema,
  paymentStatusResponseSchema,
  validatePromoResponseSchema,
} from '@booking/contracts';
import { publicGetData, publicPost } from './api.server';
import { storefrontEnv } from './env.server';

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
  query: { mode: AvailabilityMode; from: string; to: string },
): Promise<AvailabilityResponse> {
  const qs = new URLSearchParams(query).toString();
  return publicGetData(
    request,
    `/public/listings/${encodeURIComponent(slug)}/availability?${qs}`,
    { schema: availabilityResponseSchema },
  );
}

// ── Promotions (§12.3) ──────────────────────────────────────────────────────────

export function validatePromo(
  request: Request,
  input: { code: string; listingId: string; amount: string; start?: string; end?: string },
): Promise<ApiResult<ValidatePromoResponse>> {
  return publicPost(request, '/public/checkout/validate-promo', input, {
    schema: validatePromoResponseSchema,
  });
}

/** The best auto-applied campaign for a slot (§12.1), or null when none applies. */
export function resolveAutoCampaign(
  request: Request,
  input: { listingId: string; amount: string; start?: string; end?: string },
): Promise<ApiResult<AutoCampaignResponse>> {
  return publicPost(request, '/public/checkout/auto-campaigns', input, {
    schema: autoCampaignResponseSchema,
  });
}

// ── Bookings (§8) ───────────────────────────────────────────────────────────────

export function createBooking(
  request: Request,
  input: CreateBookingInput,
  idempotencyKey: string,
): Promise<ApiResult<BookingResponse>> {
  return publicPost(request, '/public/bookings', input, {
    headers: { 'idempotency-key': idempotencyKey },
    schema: bookingResponseSchema,
  });
}

export function checkoutBooking(
  request: Request,
  bookingId: string,
): Promise<ApiResult<CheckoutResponse>> {
  return publicPost(
    request,
    `/public/bookings/${encodeURIComponent(bookingId)}/checkout`,
    {},
    { schema: checkoutResponseSchema },
  );
}

export function fetchBookingByCode(
  request: Request,
  code: string,
  otp?: string,
): Promise<BookingResponse | null> {
  // SECURITY_EXCEPTION API-DEP-01: the current API only accepts this credential
  // on GET. The browser now POSTs it to the BFF and it remains server-side; SF-05
  // removes this final upstream URL use when the API exposes an opaque grant.
  const qs = otp ? `?otp=${encodeURIComponent(otp)}` : '';
  return publicGetData(request, `/public/bookings/${encodeURIComponent(code)}${qs}`, {
    schema: bookingResponseSchema,
    allowNotFound: true,
  });
}

export function requestBookingOtp(
  request: Request,
  code: string,
): Promise<ApiResult<BookingOtpResponse>> {
  return publicPost(
    request,
    `/public/bookings/${encodeURIComponent(code)}/request-otp`,
    {},
    { schema: bookingOtpResponseSchema },
  );
}

export function cancelBooking(
  request: Request,
  code: string,
  body: { reason?: string; otp?: string },
): Promise<ApiResult<CancelBookingResponse>> {
  return publicPost(
    request,
    `/public/bookings/${encodeURIComponent(code)}/cancel`,
    body,
    { schema: cancelBookingResponseSchema },
  );
}

// ── Payments (§11) ──────────────────────────────────────────────────────────────

export function fetchPaymentStatus(
  request: Request,
  code: string,
): Promise<PaymentStatusResponse | null> {
  return publicGetData(request, `/public/bookings/${encodeURIComponent(code)}/payment-status`, {
    schema: paymentStatusResponseSchema,
    allowNotFound: true,
  });
}

/** Dev-only mock payment (gated behind `ALLOW_MOCK_PAYMENTS` on the API). */
export function mockPay(request: Request, code: string): Promise<ApiResult<BookingResponse>> {
  return publicPost(
    request,
    `/public/bookings/${encodeURIComponent(code)}/mock-pay`,
    {},
    { schema: bookingResponseSchema },
  );
}

/** Exposed to routes so the confirmation page can render the dev mock-pay button. */
export function mockPaymentsEnabled(): boolean {
  return storefrontEnv.allowMockPayments;
}
