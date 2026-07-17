# Storefront Unified API Adapter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace storefront HTTP fragmentation with one request-aware, runtime-validated server adapter while preserving all existing storefront behavior.

**Architecture:** Extend `@booking/api-client` additively with public GET and registration/auth transport options, then make `apps/storefront/app/lib/api.server.ts` the sole ordinary JSON HTTP boundary. Feature helpers supply existing `@booking/contracts` schemas; only readiness and upload/presign retain direct `fetch()` calls, enforced by the storefront security gate.

**Tech Stack:** TypeScript, Axios, Zod 3, React Router 8 framework mode, pnpm 10.13.1, Turborepo.

## Global Constraints

- Modify only `packages/api-client`, `apps/storefront`, `scripts/architecture/check-storefront-security.mjs`, this plan/spec documentation, and the lockfile only if package metadata actually changes.
- Do not modify `apps/dashboard`, `apps/api`, database code, migrations, `packages/contracts`, or `packages/ui`.
- Do not add test files, test configuration, test scripts, CI test steps, or test dependencies; ADR 0005 requires verification through lint, typecheck, build, security checks, and running the app.
- Keep every existing API path, request body, response envelope, React Router URL, session cookie, checkout cookie, idempotency key, redirect allowlist, tenant behavior, and translated form behavior compatible.
- Use existing schemas exported by `@booking/contracts`; do not redeclare domain response schemas in the storefront.
- Every normal JSON success response consumed by storefront feature code must be parsed by a supplied schema before use.
- Direct `fetch()` may remain only in `apps/storefront/app/routes/readyz.ts` and `apps/storefront/app/routes/uploads.presign.tsx`.
- Run package checks after every task and commit each task separately.

---

## File Map

### Package boundary

- `packages/api-client/src/types.ts`: shared auth result, registration credentials, and request-option types.
- `packages/api-client/src/client.ts`: public GET, shared public request path, shared login/register response parsing, and optional transport options for auth operations.
- `packages/api-client/src/index.ts`: additive type exports.

### Storefront boundary

- `apps/storefront/app/lib/api.server.ts`: request-derived host, signal, request-id, public/authenticated calls, read unwrapping, and auth wrappers.
- `apps/storefront/app/lib/auth-middleware.server.ts`: request-aware session inspection and refresh.
- `apps/storefront/app/lib/auth-routes.server.ts`: request-aware auth calls.
- `apps/storefront/app/lib/partner-onboarding.server.ts`: request-aware auth and partner application calls.
- `apps/storefront/app/lib/catalog.server.ts`: schema-validated catalog reads.
- `apps/storefront/app/lib/administrative-divisions.server.ts`: schema-validated administrative reads without duplicate parsing.
- `apps/storefront/app/lib/tenant.server.ts`: schema-validated Host-to-tenant resolution through the adapter.
- `apps/storefront/app/lib/booking.server.ts`: schema-validated booking reads/mutations using shared `ApiResult`.
- `apps/storefront/app/lib/affiliate.server.ts`: validated referral/application calls.
- `apps/storefront/app/lib/partner.server.ts`: api-client-backed registration/login/application calls.
- `apps/storefront/app/routes/bookings.tsx`: request-aware authenticated booking list.
- `apps/storefront/app/routes/become-affiliate.tsx`: passes the request into registration and application helpers.
- Delete `apps/storefront/app/lib/public-api.server.ts` after all consumers migrate.

### Guardrail

- `scripts/architecture/check-storefront-security.mjs`: reject direct storefront fetches outside two explicit exceptions.

---

### Task 1: Extend `@booking/api-client` Additively

**Files:**

- Modify: `packages/api-client/src/types.ts`
- Modify: `packages/api-client/src/client.ts`
- Modify: `packages/api-client/src/index.ts`

**Interfaces:**

- Produces: `ApiClient.publicGet<T>(path, options?)`.
- Produces: `ApiClient.register(credentials, options?)`.
- Produces: optional `AuthRequestOptions` for `login`, `register`, `refresh`, `sessionInfo`, and `logout` without breaking existing consumers.
- Produces: `BackendAuthResult`, compatible aliases `BackendLoginResult` and `BackendRegisterResult`, and `BackendRegisterCredentials`.

- [ ] **Step 1: Define compatible auth types**

Replace the current login result declaration in `packages/api-client/src/types.ts` with:

```ts
export interface BackendRegisterCredentials {
  email: string;
  password: string;
  fullName: string;
  phone?: string;
  locale?: 'vi' | 'en';
}

export type AuthRequestOptions = Pick<
  ApiRequestOptions<never>,
  'signal' | 'timeoutMs' | 'headers' | 'requestId'
>;

export interface BackendAuthResult {
  ok: boolean;
  status: number;
  tokens?: RefreshedTokens;
  user?: { id: string };
  code?: string;
  failure?: ApiFailure;
}

export type BackendLoginResult = BackendAuthResult;
export type BackendRegisterResult = BackendAuthResult;
```

Keep `BackendRefreshResult` unchanged.

- [ ] **Step 2: Generalize unauthenticated JSON requests**

In `packages/api-client/src/client.ts`, replace the POST-only public helper with a method-aware helper:

```ts
async function publicRequest<T>(
  instance: AxiosInstance,
  method: Method,
  path: string,
  body: unknown,
  options?: ApiRequestOptions<T>,
): Promise<ApiResult<T>> {
  try {
    const response = await instance.request({
      method,
      url: path,
      data: body,
      params: options?.query,
      signal: options?.signal,
      timeout: options?.timeoutMs,
      headers: {
        ...options?.headers,
        ...(options?.requestId ? { 'x-request-id': options.requestId } : {}),
      },
    });
    return toResult<T>(response, options?.schema);
  } catch (error) {
    return transportError<T>(error);
  }
}
```

Add `publicGet` to `ApiClient` and wire both public methods in `createApiClient()`:

```ts
publicGet<T>(path: string, options?: ApiRequestOptions<T>): Promise<ApiResult<T>>;
publicPost<T>(path: string, body: unknown, options?: ApiRequestOptions<T>): Promise<ApiResult<T>>;

// createApiClient return object
publicGet: (path, options) => publicRequest(instance, 'GET', path, undefined, options),
publicPost: (path, body, options) => publicRequest(instance, 'POST', path, body, options),
```

- [ ] **Step 3: Share validated login/register parsing**

Import `authSessionResponseSchema`, `AuthRequestOptions`, `BackendAuthResult`, `BackendRegisterCredentials`, and `BackendRegisterResult`. Add this internal helper:

```ts
async function authenticate(
  instance: AxiosInstance,
  path: '/auth/login' | '/auth/register',
  credentials: { email: string; password: string } | BackendRegisterCredentials,
  options?: AuthRequestOptions,
): Promise<BackendAuthResult> {
  try {
    const response = await instance.post(path, credentials, {
      signal: options?.signal,
      timeout: options?.timeoutMs,
      headers: {
        ...options?.headers,
        ...(options?.requestId ? { 'x-request-id': options.requestId } : {}),
      },
    });
    if (response.status < 200 || response.status >= 300) {
      const body =
        response.data && typeof response.data === 'object'
          ? (response.data as { code?: string })
          : {};
      return { ok: false, status: response.status, code: body.code, failure: 'http' };
    }
    const cookies = parseSetCookies(response);
    const parsed = authSessionResponseSchema.safeParse(response.data);
    if (!cookies.sid || !cookies.rid || !parsed.success) {
      return { ok: false, status: 502, failure: 'invalid-response' };
    }
    return {
      ok: true,
      status: response.status,
      tokens: { accessToken: cookies.sid, refreshToken: cookies.rid },
      user: { id: parsed.data.user.id },
    };
  } catch (error) {
    const result = transportError<never>(error);
    return { ok: false, status: result.status, failure: result.failure };
  }
}
```

Update the public interface and return object:

```ts
login(
  credentials: { email: string; password: string },
  options?: AuthRequestOptions,
): Promise<BackendLoginResult>;
register(
  credentials: BackendRegisterCredentials,
  options?: AuthRequestOptions,
): Promise<BackendRegisterResult>;

login: (credentials, options) => authenticate(instance, '/auth/login', credentials, options),
register: (credentials, options) => authenticate(instance, '/auth/register', credentials, options),
```

- [ ] **Step 4: Make refresh/session/logout accept request transport metadata**

Replace the refresh option type with `AuthRequestOptions` and include caller headers without allowing them to override the refresh cookie:

```ts
refresh(refreshToken: string, options?: AuthRequestOptions): Promise<BackendRefreshResult>;

const response = await instance.post('/auth/refresh', undefined, {
  signal: options?.signal,
  timeout: options?.timeoutMs,
  headers: {
    ...options?.headers,
    cookie: `rid=${refreshToken}`,
    ...(options?.requestId ? { 'x-request-id': options.requestId } : {}),
  },
});
```

Add an optional `AuthRequestOptions` parameter to `sessionInfo()` and `logout()` and forward it through `request()`:

```ts
sessionInfo(accessToken: string, options?: AuthRequestOptions): Promise<SessionInfoResponse | null>;
logout(accessToken: string, options?: AuthRequestOptions): Promise<void>;

async sessionInfo(accessToken, options) {
  const result = await request<SessionInfoResponse>(
    instance,
    'GET',
    '/auth/session',
    accessToken,
    undefined,
    { ...options, schema: sessionInfoResponseSchema },
  );
  return result.ok ? result.data : null;
},

async logout(accessToken, options) {
  await request(instance, 'POST', '/auth/logout', accessToken, undefined, options);
},
```

- [ ] **Step 5: Export the additive types**

Add these names to the type export list in `packages/api-client/src/index.ts`:

```ts
AuthRequestOptions,
BackendAuthResult,
BackendRegisterCredentials,
BackendRegisterResult,
```

- [ ] **Step 6: Verify the package**

Run:

```bash
pnpm --filter=@booking/api-client lint
pnpm --filter=@booking/api-client typecheck
pnpm --filter=@booking/api-client build
```

Expected: all three commands exit `0`; existing dashboard source remains untouched and type-compatible.

- [ ] **Step 7: Commit**

```bash
git add packages/api-client/src/types.ts packages/api-client/src/client.ts packages/api-client/src/index.ts
git commit -m "feat(api-client): add public get and registration transport"
```

---

### Task 2: Establish the Request-Aware Storefront Adapter

**Files:**

- Modify: `apps/storefront/app/lib/api.server.ts`
- Modify: `apps/storefront/app/lib/auth-middleware.server.ts`
- Modify: `apps/storefront/app/lib/auth-routes.server.ts`
- Modify: `apps/storefront/app/lib/partner-onboarding.server.ts`
- Modify: `apps/storefront/app/routes/bookings.tsx`

**Interfaces:**

- Consumes: api-client interfaces from Task 1.
- Produces: `publicGetData`, `publicPost`, `apiGet`, `apiPost`, `backendLogin`, `backendRegister`, `backendRefresh`, and `backendLogout`, all taking the incoming `Request` first.
- Produces: read failure policy `404 nullable when allowed`, `504 timeout`, `502 invalid response`, and `503 other upstream/server failures`.

- [ ] **Step 1: Replace the storefront adapter with request-derived metadata**

Implement these types and helpers in `apps/storefront/app/lib/api.server.ts`:

```ts
import {
  createApiClient,
  type ApiRequestOptions,
  type ApiResult,
  type Auth,
  type BackendRegisterCredentials,
} from '@booking/api-client';
import type { ZodType } from 'zod';
import { storefrontEnv } from './env.server';

const client = () => createApiClient(storefrontEnv.backendUrl);

type StorefrontJsonOptions<T> = Omit<ApiRequestOptions<T>, 'signal' | 'schema'> & {
  schema: ZodType<T>;
};

type NullableReadOptions<T> = StorefrontJsonOptions<T> & { allowNotFound: true };

function forwardedHost(request: Request): string {
  return (request.headers.get('host') ?? 'localhost').split(':')[0];
}

function requestOptions<T>(
  request: Request,
  options: StorefrontJsonOptions<T>,
): ApiRequestOptions<T> {
  return {
    ...options,
    signal: request.signal,
    requestId: options.requestId ?? request.headers.get('x-request-id') ?? undefined,
    headers: {
      ...options.headers,
      'x-forwarded-host': forwardedHost(request),
    },
  };
}

function statusForReadFailure(result: ApiResult<unknown>): number {
  if (result.failure === 'timeout') return 504;
  if (result.failure === 'invalid-response') return 502;
  if (result.status >= 500 || result.failure === 'network') return 503;
  return result.status;
}

function readFailure(result: ApiResult<unknown>): Response {
  return new Response('Storefront API request failed', {
    status: statusForReadFailure(result),
  });
}
```

- [ ] **Step 2: Add public/authenticated JSON operations**

Add the final request-first exports:

```ts
export function publicGetData<T>(
  request: Request,
  path: string,
  options: NullableReadOptions<T>,
): Promise<T | null>;
export function publicGetData<T>(
  request: Request,
  path: string,
  options: StorefrontJsonOptions<T>,
): Promise<T>;
export async function publicGetData<T>(
  request: Request,
  path: string,
  options: StorefrontJsonOptions<T> & { allowNotFound?: boolean },
): Promise<T | null> {
  const result = await client().publicGet(path, requestOptions(request, options));
  if (result.status === 404 && options.allowNotFound) return null;
  if (!result.ok || result.data === null) throw readFailure(result);
  return result.data;
}

export const publicPost = <T>(
  request: Request,
  path: string,
  body: unknown,
  options: StorefrontJsonOptions<T>,
) => client().publicPost(path, body, requestOptions(request, options));

export const apiGet = <T>(
  request: Request,
  path: string,
  auth: Auth,
  options: StorefrontJsonOptions<T>,
) => client().get(path, auth, requestOptions(request, options));

export const apiPost = <T>(
  request: Request,
  path: string,
  body: unknown,
  auth: Auth,
  options: StorefrontJsonOptions<T>,
) => client().post(path, body, auth, requestOptions(request, options));
```

- [ ] **Step 3: Add request-aware auth wrappers**

Add:

```ts
function authOptions(request: Request) {
  return {
    signal: request.signal,
    requestId: request.headers.get('x-request-id') ?? undefined,
    headers: { 'x-forwarded-host': forwardedHost(request) },
  };
}

export const backendLogin = (request: Request, credentials: { email: string; password: string }) =>
  client().login(credentials, authOptions(request));
export const backendRegister = (request: Request, credentials: BackendRegisterCredentials) =>
  client().register(credentials, authOptions(request));
export const backendRefresh = (request: Request, refreshToken: string) =>
  client().refresh(refreshToken, authOptions(request));
export const backendLogout = (request: Request, accessToken: string) =>
  client().logout(accessToken, authOptions(request));
```

- [ ] **Step 4: Update existing adapter consumers atomically**

Apply these exact call-shape changes:

```ts
// auth-middleware.server.ts
async function authenticate(data: StorefrontSessionData, request: Request): Promise<AuthResult> {
  const initial = await apiGet<SessionInfoResponse>(request, '/auth/session', data.accessToken, {
    schema: sessionInfoResponseSchema,
  });
  if (initial.ok && initial.data) {
    return { kind: 'authenticated', info: initial.data, data, rotated: false };
  }
  if (initial.status !== 401) {
    return initial.status >= 500 ? { kind: 'unavailable' } : { kind: 'invalid' };
  }
  const refreshed = await backendRefresh(request, data.refreshToken);
  if (!refreshed.ok || !refreshed.tokens) {
    return refreshed.status >= 500 ? { kind: 'unavailable' } : { kind: 'invalid' };
  }
  const next = { ...data, ...refreshed.tokens };
  const retried = await apiGet<SessionInfoResponse>(request, '/auth/session', next.accessToken, {
    schema: sessionInfoResponseSchema,
  });
  if (!retried.ok || !retried.data) {
    return retried.status >= 500 ? { kind: 'unavailable' } : { kind: 'invalid' };
  }
  return { kind: 'authenticated', info: retried.data, data: next, rotated: true };
}

// storefrontAuthMiddleware
const result = await authenticate(stored.data, request);
```

For every call in `auth-routes.server.ts` and `partner-onboarding.server.ts`, add `request` as the first argument:

```ts
await publicPost<AuthChallengeResponse>(request, '/auth/registration/start', parsed.data, {
  schema: authChallengeResponseSchema,
});
await backendLogin(request, parsed.data);
await backendLogout(request, auth.session.accessToken);
```

Do not keep explicit `signal: request.signal`; the adapter now injects it.

Update `apps/storefront/app/routes/bookings.tsx`:

```ts
const result = await apiGet<BookingResponse[]>(
  request,
  '/public/my-bookings',
  auth.session.accessToken,
  { schema: z.array(bookingResponseSchema) },
);
```

- [ ] **Step 5: Verify the adapter and consumers**

Run:

```bash
pnpm --filter=@booking/storefront lint
pnpm --filter=@booking/storefront typecheck
pnpm --filter=@booking/storefront security
```

Expected: all commands exit `0`; direct fetch count is unchanged at this checkpoint.

- [ ] **Step 6: Commit**

```bash
git add apps/storefront/app/lib/api.server.ts apps/storefront/app/lib/auth-middleware.server.ts apps/storefront/app/lib/auth-routes.server.ts apps/storefront/app/lib/partner-onboarding.server.ts apps/storefront/app/routes/bookings.tsx
git commit -m "refactor(storefront): centralize request-aware API calls"
```

---

### Task 3: Migrate Tenant, Catalog, and Administrative Reads

**Files:**

- Modify: `apps/storefront/app/lib/tenant.server.ts`
- Modify: `apps/storefront/app/lib/catalog.server.ts`
- Modify: `apps/storefront/app/lib/administrative-divisions.server.ts`
- Delete: `apps/storefront/app/lib/public-api.server.ts`

**Interfaces:**

- Consumes: `publicGetData(request, path, { schema, allowNotFound? })` from Task 2.
- Preserves: `resolveTenant`, all catalog helper signatures, and administrative helper signatures.

- [ ] **Step 1: Migrate tenant resolution**

Replace the transport in `tenant.server.ts` with:

```ts
import { publicTenantResponseSchema } from '@booking/contracts';
import { publicGetData } from './api.server';
import { toStorefrontTenant, type StorefrontTenant } from './tenant-mapper';

export async function resolveTenant(request: Request): Promise<StorefrontTenant> {
  try {
    const dto = await publicGetData(request, '/public/tenant', {
      schema: publicTenantResponseSchema,
    });
    return toStorefrontTenant(dto);
  } catch (error) {
    if (error instanceof Response && error.status === 404) {
      const hostname = (request.headers.get('host') ?? 'localhost').split(':')[0];
      throw new Response(`No storefront found for "${hostname}"`, { status: 404 });
    }
    if (error instanceof Response && error.status === 503) {
      throw new Response('Storefront temporarily unavailable', { status: 503 });
    }
    throw error;
  }
}
```

Do not catch `502` or `504`; retain their more precise upstream-failure status.

- [ ] **Step 2: Attach schemas to catalog reads**

Import `z` and the contract schemas, then implement each transport call through `publicGetData`:

```ts
const listingTypesSchema = z.array(publicListingTypeResponseSchema);

export function fetchListingTypes(request: Request): Promise<PublicListingTypeResponse[]> {
  return publicGetData(request, '/public/listing-types', { schema: listingTypesSchema });
}

export function fetchListingGroup(request: Request, slug: string) {
  return publicGetData(request, `/public/listings/groups/${encodeURIComponent(slug)}`, {
    schema: publicListingGroupDetailResponseSchema,
    allowNotFound: true,
  });
}

export function searchListings(request: Request, search: URLSearchParams) {
  const query = search.toString();
  return publicGetData(request, `/public/listings${query ? `?${query}` : ''}`, {
    schema: publicCatalogSearchResponseSchema,
  });
}

export function fetchListing(request: Request, slug: string) {
  return publicGetData(request, `/public/listings/${encodeURIComponent(slug)}`, {
    schema: publicListingDetailResponseSchema,
    allowNotFound: true,
  });
}

export function fetchQuote(request: Request, slug: string, query: URLSearchParams) {
  return publicGetData(
    request,
    `/public/listings/${encodeURIComponent(slug)}/quote?${query.toString()}`,
    { schema: quoteResponseSchema, allowNotFound: true },
  );
}
```

Keep the existing aggregation/mapping logic in `fetchListings()` unchanged; remove obsolete casts and `?? []` fallbacks.

- [ ] **Step 3: Remove duplicate administrative parsing**

Replace both `unknown` reads and local `safeParse` calls with:

```ts
export function loadAdministrativeProvinces(request: Request): Promise<AdministrativeProvince[]> {
  return publicGetData(request, '/public/administrative-divisions/provinces', {
    schema: administrativeProvinceListSchema,
  });
}

export function loadAdministrativeWards(
  request: Request,
  provinceCode: string,
): Promise<AdministrativeWard[]> {
  return publicGetData(
    request,
    `/public/administrative-divisions/wards?provinceCode=${encodeURIComponent(provinceCode)}`,
    { schema: administrativeWardListSchema },
  );
}
```

- [ ] **Step 4: Delete the obsolete public transport**

Delete `apps/storefront/app/lib/public-api.server.ts`, then run:

```bash
rg -n 'public-api\.server|requestPublicJson' apps/storefront
```

Expected: no output and exit status `1` from `rg` because no matches remain.

- [ ] **Step 5: Verify reads**

Run:

```bash
pnpm --filter=@booking/storefront lint
pnpm --filter=@booking/storefront typecheck
pnpm --filter=@booking/storefront security
```

Expected: all commands exit `0`.

- [ ] **Step 6: Commit**

```bash
git add apps/storefront/app/lib/api.server.ts apps/storefront/app/lib/tenant.server.ts apps/storefront/app/lib/catalog.server.ts apps/storefront/app/lib/administrative-divisions.server.ts apps/storefront/app/lib/public-api.server.ts
git commit -m "refactor(storefront): validate public API reads"
```

---

### Task 4: Migrate Booking, Promotion, and Payment Flows

**Files:**

- Modify: `apps/storefront/app/lib/booking.server.ts`

**Interfaces:**

- Consumes: `publicGetData` and `publicPost` from Task 2.
- Produces: existing booking helper signatures returning the shared `ApiResult<T>` from `@booking/api-client`.

- [ ] **Step 1: Replace local transport and result type**

Delete the local `ApiResult`, `backendUrl`, `hostOf`, `baseHeaders`, and `postJson` declarations. Import the shared result and adapter:

```ts
import type { ApiResult } from '@booking/api-client';
import {
  autoCampaignResponseSchema,
  availabilityResponseSchema,
  bookingOtpResponseSchema,
  bookingResponseSchema,
  cancelBookingResponseSchema,
  checkoutResponseSchema,
  paymentStatusResponseSchema,
  validatePromoResponseSchema,
  // existing response/input types
} from '@booking/contracts';
import { publicGetData, publicPost } from './api.server';
```

- [ ] **Step 2: Migrate availability and optional booking/payment reads**

Use:

```ts
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

export function fetchBookingByCode(request: Request, code: string, otp?: string) {
  const qs = otp ? `?otp=${encodeURIComponent(otp)}` : '';
  return publicGetData(request, `/public/bookings/${encodeURIComponent(code)}${qs}`, {
    schema: bookingResponseSchema,
    allowNotFound: true,
  });
}

export function fetchPaymentStatus(request: Request, code: string) {
  return publicGetData(
    request,
    `/public/bookings/${encodeURIComponent(code)}/payment-status`,
    { schema: paymentStatusResponseSchema, allowNotFound: true },
  );
}
```

Retain the existing `SECURITY_EXCEPTION API-DEP-01` comment immediately above the OTP query compatibility path so the existing gate still counts exactly one exception.

- [ ] **Step 3: Migrate every mutation with its contract schema**

Use the same pattern for all mutation helpers:

```ts
export function validatePromo(
  request: Request,
  input: { code: string; listingId: string; amount: string; start?: string; end?: string },
) {
  return publicPost(request, '/public/checkout/validate-promo', input, {
    schema: validatePromoResponseSchema,
  });
}

export function resolveAutoCampaign(
  request: Request,
  input: { listingId: string; amount: string; start?: string; end?: string },
) {
  return publicPost(request, '/public/checkout/auto-campaigns', input, {
    schema: autoCampaignResponseSchema,
  });
}

export function createBooking(
  request: Request,
  input: CreateBookingInput,
  idempotencyKey: string,
) {
  return publicPost(request, '/public/bookings', input, {
    headers: { 'idempotency-key': idempotencyKey },
    schema: bookingResponseSchema,
  });
}

export function checkoutBooking(request: Request, bookingId: string) {
  return publicPost(
    request,
    `/public/bookings/${encodeURIComponent(bookingId)}/checkout`,
    {},
    { schema: checkoutResponseSchema },
  );
}
```

Implement the remaining mutations explicitly:

```ts
export function requestBookingOtp(request: Request, code: string) {
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
) {
  return publicPost(
    request,
    `/public/bookings/${encodeURIComponent(code)}/cancel`,
    body,
    { schema: cancelBookingResponseSchema },
  );
}

export function mockPay(request: Request, code: string) {
  return publicPost(
    request,
    `/public/bookings/${encodeURIComponent(code)}/mock-pay`,
    {},
    { schema: bookingResponseSchema },
  );
}
```

Keep all exported input and return types compatible. Keep `mockPaymentsEnabled()` unchanged.

- [ ] **Step 4: Verify booking flows statically**

Run:

```bash
rg -n 'postJson|interface ApiResult|fetch\(' apps/storefront/app/lib/booking.server.ts
pnpm --filter=@booking/storefront lint
pnpm --filter=@booking/storefront typecheck
pnpm --filter=@booking/storefront security
```

Expected: `rg` finds only the documented OTP-related text if it contains the word `fetch`; it must find no `postJson`, local `ApiResult`, or actual `fetch(` call. All pnpm commands exit `0`.

- [ ] **Step 5: Commit**

```bash
git add apps/storefront/app/lib/booking.server.ts
git commit -m "refactor(storefront): validate booking API responses"
```

---

### Task 5: Migrate Affiliate and Partner Application Flows

**Files:**

- Modify: `apps/storefront/app/lib/affiliate.server.ts`
- Modify: `apps/storefront/app/lib/partner.server.ts`
- Modify: `apps/storefront/app/lib/partner-onboarding.server.ts`
- Modify: `apps/storefront/app/routes/become-affiliate.tsx`

**Interfaces:**

- Consumes: `backendRegister`, `backendLogin`, `apiPost`, and `publicPost` from Task 2.
- Preserves: referral fail-soft behavior and all `PartnerErrorCode`/affiliate form mappings.

- [ ] **Step 1: Migrate referral tracking while keeping it fail-soft**

In `affiliate.server.ts`, remove backend URL and host helpers. Import `publicPost`, `apiPost`, `trackReferralResponseSchema`, and `affiliateResponseSchema`. Implement:

```ts
export async function trackReferral(
  request: Request,
  code: string,
  visitorId: string,
): Promise<boolean> {
  const result = await publicPost(
    request,
    '/public/referrals/track',
    { code, visitorId },
    { schema: trackReferralResponseSchema },
  );
  if (!result.ok || !result.data) {
    console.warn('Storefront referral tracking failed', {
      status: result.status,
      failure: result.failure,
      requestId: result.requestId,
    });
    return false;
  }
  return result.data.valid;
}
```

Do not throw on any failed tracking result.

- [ ] **Step 2: Migrate affiliate application**

Change the helper to receive `request` and validate the success body:

```ts
export async function applyAsAffiliate(
  request: Request,
  token: string,
  input: AffiliateApplyPayload,
): Promise<{ ok: true } | { ok: false; code: string; status: number }> {
  const result = await apiPost(request, '/affiliate/apply', input, token, {
    schema: affiliateResponseSchema,
  });
  if (result.ok) return { ok: true };
  return { ok: false, code: result.code ?? 'generic', status: result.status };
}
```

- [ ] **Step 3: Replace partner registration/login transport**

Remove `backendUrl`, `JSON_HEADERS`, `parseSetCookies`, and all direct fetches from `partner.server.ts`. Import adapter functions and `partnerResponseSchema`. Implement:

```ts
export async function registerOrLogin(
  request: Request,
  creds: RegisterCredentials,
): Promise<TokenResult> {
  const registration = await backendRegister(request, creds);
  if (registration.ok && registration.tokens) {
    return { ok: true, token: registration.tokens.accessToken };
  }
  if (registration.status !== 409) {
    return { ok: false, code: 'generic', status: registration.status };
  }
  const login = await backendLogin(request, {
    email: creds.email,
    password: creds.password,
  });
  if (!login.ok || !login.tokens) {
    return { ok: false, code: 'emailTakenWrongPassword', status: login.status };
  }
  return { ok: true, token: login.tokens.accessToken };
}

export async function applyAsPartner(
  request: Request,
  token: string,
  input: PartnerApplyPayload,
): Promise<{ ok: true } | { ok: false; code: ErrorCode; status: number }> {
  const result = await apiPost(request, '/partners/apply', input, token, {
    schema: partnerResponseSchema,
  });
  if (result.ok) return { ok: true };
  const code = result.code ? APPLY_ERROR_CODES[result.code] : undefined;
  return { ok: false, code: code ?? 'generic', status: result.status };
}
```

- [ ] **Step 4: Update callers**

In `partner-onboarding.server.ts`:

```ts
const applied = await applyAsPartner(request, auth.session.accessToken, payload);
```

In `become-affiliate.tsx`:

```ts
const auth = await registerOrLogin(request, {
  email: v.email.trim(),
  password: v.password,
  fullName: v.fullName.trim(),
  ...(v.phone?.trim() ? { phone: v.phone.trim() } : {}),
});

const applied = await applyAsAffiliate(request, auth.token, {
  tenantId: tenant.id,
  payoutInfo,
});
```

- [ ] **Step 5: Verify no fragmented transports remain**

Run:

```bash
rg -n 'fetch\(' apps/storefront/app
pnpm --filter=@booking/storefront lint
pnpm --filter=@booking/storefront typecheck
pnpm --filter=@booking/storefront security
```

Expected: `fetch(` appears only in `routes/readyz.ts` and `routes/uploads.presign.tsx`; all pnpm commands exit `0`.

- [ ] **Step 6: Commit**

```bash
git add apps/storefront/app/lib/affiliate.server.ts apps/storefront/app/lib/partner.server.ts apps/storefront/app/lib/partner-onboarding.server.ts apps/storefront/app/routes/become-affiliate.tsx
git commit -m "refactor(storefront): unify partner and affiliate API calls"
```

---

### Task 6: Enforce the Boundary and Run Final Verification

**Files:**

- Modify: `scripts/architecture/check-storefront-security.mjs`

**Interfaces:**

- Consumes: final direct-fetch layout from Tasks 3–5.
- Produces: an architecture failure naming the violating file and directing developers to `app/lib/api.server.ts`.

- [ ] **Step 1: Add the direct-fetch allowlist and check**

Near the storefront security counters, add:

```js
const directFetchAllowlist = new Set([
  'apps/storefront/app/routes/readyz.ts',
  'apps/storefront/app/routes/uploads.presign.tsx',
]);
```

Inside the storefront-file loop, after reading `source`, add:

```js
if (/\bfetch\s*\(/.test(source) && !directFetchAllowlist.has(path)) {
  failures.push(
    `${path}: direct fetch is forbidden; use apps/storefront/app/lib/api.server.ts`,
  );
}
```

Keep every existing security check and counter unchanged.

- [ ] **Step 2: Prove the negative gate without adding a test file**

Temporarily add this line to `apps/storefront/app/lib/catalog.server.ts` using `apply_patch`:

```ts
const architectureGateProbe = () => fetch('https://invalid.example');
```

Run:

```bash
pnpm --filter=@booking/storefront security
```

Expected: non-zero exit and output containing:

```text
apps/storefront/app/lib/catalog.server.ts: direct fetch is forbidden; use apps/storefront/app/lib/api.server.ts
```

Immediately remove the probe with `apply_patch`. Run the security command again; expected exit `0`.

- [ ] **Step 3: Run static boundary checks**

Run:

```bash
rg -n 'fetch\(' apps/storefront/app
rg -n 'public-api\.server|requestPublicJson|postJson' apps/storefront
rg -n 'resolveTenant\(request\)' apps/storefront
```

Expected:

- First command reports only `apps/storefront/app/routes/readyz.ts` and `apps/storefront/app/routes/uploads.presign.tsx`.
- Second command has no output.
- Third command reports only the resolver definition and the one middleware invocation already allowed by the tenant architecture rule.

- [ ] **Step 4: Run the full verification suite**

Run:

```bash
pnpm --filter=@booking/api-client lint
pnpm --filter=@booking/api-client typecheck
pnpm --filter=@booking/api-client build
pnpm --filter=@booking/storefront lint
pnpm --filter=@booking/storefront typecheck
pnpm --filter=@booking/storefront security
pnpm --filter=@booking/storefront build
```

Expected: every command exits `0`. Existing non-fatal sourcemap warnings originating from `packages/ui` may remain; no new warning from this refactor is acceptable.

- [ ] **Step 5: Smoke-run operational and tenant behavior**

With local infrastructure/API available, start the storefront:

```bash
pnpm --filter=@booking/storefront dev
```

In a second terminal run:

```bash
curl -sS -o /dev/null -w '%{http_code}\n' http://localhost:5173/vi
curl -sS -o /dev/null -w '%{http_code}\n' http://localhost:5173/en
curl -sS -o /dev/null -w '%{http_code}\n' http://localhost:5173/healthz
curl -sS -o /dev/null -w '%{http_code}\n' http://localhost:5173/readyz
curl -sS -H 'Host: unmapped.invalid' -o /dev/null -w '%{http_code}\n' http://localhost:5173/vi
```

Expected status sequence with the seeded local stack: `200`, `200`, `200`, `200`, `404`.

Manually verify in the running storefront:

- Catalog, listing, availability, and quote render for `/vi` and `/en`.
- Anonymous guest checkout and authenticated checkout create a booking and preserve payment redirect behavior.
- Login, OTP registration/reset, partner onboarding, and affiliate application preserve cookies and translated form errors.
- Referral tracking failure remains non-blocking.
- Upload/presign still completes through its existing proxy route.

- [ ] **Step 6: Commit the guardrail**

```bash
git add scripts/architecture/check-storefront-security.mjs
git commit -m "chore(storefront): enforce unified API transport"
```

- [ ] **Step 7: Review final scope**

Run:

```bash
git status --short
git diff --stat main~6..HEAD
git diff --name-only main~6..HEAD
```

Expected: clean worktree after commits; changed implementation files are limited to `packages/api-client`, `apps/storefront`, and the architecture script. The approved spec/plan documentation may appear in the wider branch history. There must be no file under `apps/dashboard`, `apps/api`, database/migration paths, `packages/contracts`, or `packages/ui`.
