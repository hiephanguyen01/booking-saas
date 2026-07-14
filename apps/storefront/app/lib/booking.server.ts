import type {
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

/**
 * Server-only booking BFF (§20): the storefront never calls the API from the
 * browser. GET reads mirror `catalog.server.ts` (swallow → null); mutations
 * return a structured `ApiResult` so routes can surface field errors and stable
 * problem messages instead of throwing.
 */
export interface ApiResult<T> {
  ok: boolean;
  status: number;
  data: T | null;
  /** Human message from the API's problem body (`message`). */
  error?: string;
  /** Stable machine code from the API (`code`), e.g. `SLOT_TAKEN`, `VALIDATION_ERROR`. */
  code?: string;
  /** Per-field messages from a zod `VALIDATION_ERROR` (`details.fieldErrors`). */
  fieldErrors?: Record<string, string[]>;
}

const backendUrl = (): string => process.env.BACKEND_URL ?? 'http://localhost:3000';

function hostOf(request: Request): string {
  return (request.headers.get('host') ?? 'localhost').split(':')[0];
}

function baseHeaders(request: Request): Record<string, string> {
  return { 'x-forwarded-host': hostOf(request), accept: 'application/json' };
}

async function getJson<T>(request: Request, path: string): Promise<T | null> {
  try {
    const res = await fetch(`${backendUrl()}${path}`, { headers: baseHeaders(request) });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function postJson<T>(
  request: Request,
  path: string,
  body: unknown,
  extraHeaders: Record<string, string> = {},
): Promise<ApiResult<T>> {
  let res: Response;
  try {
    res = await fetch(`${backendUrl()}${path}`, {
      method: 'POST',
      headers: { ...baseHeaders(request), 'content-type': 'application/json', ...extraHeaders },
      body: JSON.stringify(body ?? {}),
    });
  } catch {
    return { ok: false, status: 503, data: null, error: 'Không kết nối được máy chủ.' };
  }

  let payload: unknown = null;
  try {
    payload = await res.json();
  } catch {
    payload = null;
  }

  if (res.ok) {
    return { ok: true, status: res.status, data: payload as T };
  }

  const record = (payload ?? {}) as Record<string, unknown>;
  const error = typeof record.message === 'string' ? record.message : undefined;
  const code = typeof record.code === 'string' ? record.code : undefined;
  const details = record.details as { fieldErrors?: Record<string, string[]> } | undefined;
  const fieldErrors =
    details && typeof details.fieldErrors === 'object' ? details.fieldErrors : undefined;
  return { ok: false, status: res.status, data: null, error, code, fieldErrors };
}

// ── Availability (§9) ──────────────────────────────────────────────────────────

export function fetchAvailability(
  request: Request,
  slug: string,
  query: { mode: AvailabilityMode; from: string; to: string },
): Promise<AvailabilityResponse | null> {
  const qs = new URLSearchParams(query).toString();
  return getJson<AvailabilityResponse>(
    request,
    `/public/listings/${encodeURIComponent(slug)}/availability?${qs}`,
  );
}

// ── Promotions (§12.3) ──────────────────────────────────────────────────────────

export function validatePromo(
  request: Request,
  input: { code: string; listingId: string; amount: string },
): Promise<ApiResult<ValidatePromoResponse>> {
  return postJson<ValidatePromoResponse>(request, '/public/checkout/validate-promo', input);
}

// ── Bookings (§8) ───────────────────────────────────────────────────────────────

export function createBooking(
  request: Request,
  input: CreateBookingInput,
  idempotencyKey: string,
): Promise<ApiResult<BookingResponse>> {
  return postJson<BookingResponse>(request, '/public/bookings', input, {
    'idempotency-key': idempotencyKey,
  });
}

export function checkoutBooking(
  request: Request,
  bookingId: string,
): Promise<ApiResult<CheckoutResponse>> {
  return postJson<CheckoutResponse>(
    request,
    `/public/bookings/${encodeURIComponent(bookingId)}/checkout`,
    {},
  );
}

export function fetchBookingByCode(
  request: Request,
  code: string,
  otp?: string,
): Promise<BookingResponse | null> {
  const qs = otp ? `?otp=${encodeURIComponent(otp)}` : '';
  return getJson<BookingResponse>(request, `/public/bookings/${encodeURIComponent(code)}${qs}`);
}

export function requestBookingOtp(
  request: Request,
  code: string,
): Promise<ApiResult<BookingOtpResponse>> {
  return postJson<BookingOtpResponse>(
    request,
    `/public/bookings/${encodeURIComponent(code)}/request-otp`,
    {},
  );
}

export function cancelBooking(
  request: Request,
  code: string,
  body: { reason?: string; otp?: string },
): Promise<ApiResult<CancelBookingResponse>> {
  return postJson<CancelBookingResponse>(
    request,
    `/public/bookings/${encodeURIComponent(code)}/cancel`,
    body,
  );
}

// ── Payments (§11) ──────────────────────────────────────────────────────────────

export function fetchPaymentStatus(
  request: Request,
  code: string,
): Promise<PaymentStatusResponse | null> {
  return getJson<PaymentStatusResponse>(
    request,
    `/public/bookings/${encodeURIComponent(code)}/payment-status`,
  );
}

/** Dev-only mock payment (gated behind `ALLOW_MOCK_PAYMENTS` on the API). */
export function mockPay(request: Request, code: string): Promise<ApiResult<BookingResponse>> {
  return postJson<BookingResponse>(
    request,
    `/public/bookings/${encodeURIComponent(code)}/mock-pay`,
    {},
  );
}

/** Exposed to routes so the confirmation page can render the dev mock-pay button. */
export function mockPaymentsEnabled(): boolean {
  return process.env.ALLOW_MOCK_PAYMENTS === 'true';
}
