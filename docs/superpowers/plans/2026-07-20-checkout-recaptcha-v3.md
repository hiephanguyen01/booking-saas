# Checkout reCAPTCHA v3 Implementation Plan

**Goal:** Protect the storefront “Book & pay” submission from automated booking/payment abuse with
Google reCAPTCHA v3, without changing pricing, idempotency, booking, or gateway handoff behavior.

**Architecture:** Execute reCAPTCHA in the browser only when the checkout form is submitted, pass the
single-use token through the React Router action/BFF, and verify it in the API before `CreateBookingUseCase`
runs. Keep the CAPTCHA token outside the domain `CreateBookingInput`; a checkout-specific transport
contract and one verification use-case call a verifier port backed by Google's `siteverify` endpoint.
Use one platform v3 key for all tenant domains and compare Google's returned hostname with the request
hostname server-side so verified custom domains remain supported.

**Tech Stack:** React 19, React Router 8 SSR, NestJS 11, TypeScript, Zod, Google reCAPTCHA v3.

## Decisions and constraints

- Use reCAPTCHA **v3**, action name `booking_checkout`, and an initial configurable minimum score of
  `0.5`. Run in observe-only mode briefly in production before enforcing the score if real traffic is
  available; always reject invalid tokens, wrong actions, and wrong hostnames.
- Generate the token on submit, not in the loader or on page load. Google tokens expire after two
  minutes and are single-use.
- Keep `RECAPTCHA_SECRET_KEY` API-only in code. The public `RECAPTCHA_SITE_KEY` may be serialized by
  the checkout loader. Never log, persist, cache, or include either token or secret in an error body.
- Do not put the CAPTCHA token in the checkout idempotency-key hash. Each retry needs a fresh token,
  while the existing booking request remains idempotent.
- Do not forward or trust a new client-IP header solely for CAPTCHA. Google's `remoteip` parameter is
  optional; hostname, action, token validity, score, throttling, and booking idempotency provide the
  first implementation boundary.
- Keep the global API throttle and add a focused checkout throttle. CAPTCHA supplements rate limiting;
  it does not replace it.
- Fail closed in production. Invalid/low-score tokens return a stable retryable customer error;
  Google timeout/outage returns a distinct `503` error so operations can distinguish provider failure
  from suspected bots.
- Do not add tests or test configuration. Verification is lint, typecheck, build, and running the
  checkout flow manually, per repository policy.

---

### Task 1: Add the checkout-only transport contract and configuration

**Files:**
- Modify: `.env.example`
- Modify: `packages/contracts/src/contracts/booking.ts`
- Modify: `apps/api/src/modules/booking/infrastructure/http/dto/booking.dto.ts`
- Modify: `apps/storefront/app/lib/env.server.ts`

**Interfaces:**
- Preserves: `createBookingInputSchema` / `CreateBookingInput` as the business input.
- Produces: `publicCreateBookingInputSchema` / `PublicCreateBookingInput` with one additional
  `recaptchaToken` string for `POST /public/bookings` only.
- Produces env values: `RECAPTCHA_SITE_KEY`, `RECAPTCHA_SECRET_KEY`,
  `RECAPTCHA_MIN_SCORE` (default `0.5`), and `RECAPTCHA_ENFORCE_SCORE`.

- [ ] **Step 1: Define a bounded public-booking request schema**

  Extend `createBookingInputSchema` with `recaptchaToken: z.string().trim().min(1).max(4096)` and
  export its inferred type. Do not add CAPTCHA fields to booking responses, database models, booking
  snapshots, or `CreateBookingInput`.

- [ ] **Step 2: Make the public controller DTO use the transport schema**

  Point `CreateBookingDto` at `publicCreateBookingInputSchema`; leave every internal use-case type on
  `CreateBookingInput`.

- [ ] **Step 3: Validate environment configuration**

  Add `RECAPTCHA_SITE_KEY` to `storefrontEnv` so only the public key reaches loader data. In production,
  storefront startup must fail if it is absent. The API verifier must reject missing/invalid secret
  configuration in production. Parse the minimum score as a finite number in `[0, 1]`; allow
  `RECAPTCHA_ENFORCE_SCORE=false` only for a documented observation rollout, not as a token-validation
  bypass.

- [ ] **Step 4: Document separate development and production keys**

  Add commented values and setup notes to `.env.example`: use a dedicated v3 key that allows
  `localhost` for development and a separate production key. Do not commit a real secret. For a
  platform with changing custom domains, disable Google-side domain validation only together with the
  mandatory server-side hostname comparison in Task 2.

- [ ] **Step 5: Verify contracts and environment typing**

  Run:

  ```bash
  pnpm --filter=@booking/contracts build
  pnpm --filter=@booking/storefront typecheck
  pnpm --filter=@booking/api typecheck
  ```

  Expected: all commands exit `0`; no consumer is forced to put CAPTCHA into domain booking values.

### Task 2: Add the API verification port, adapter, and use-case

**Files:**
- Create: `apps/api/src/modules/booking/domain/ports/recaptcha-verifier.port.ts`
- Create: `apps/api/src/modules/booking/application/use-cases/verify-checkout-recaptcha.use-case.ts`
- Create: `apps/api/src/modules/booking/infrastructure/recaptcha/google-recaptcha-verifier.adapter.ts`
- Modify: `apps/api/src/modules/booking/infrastructure/http/booking.module.ts`

**Interfaces:**
- Consumes: token, expected action `booking_checkout`, and normalized storefront hostname.
- Produces: a small verification result containing `valid`, `score`, `action`, `hostname`, and
  provider error codes; no booking/customer data.

- [ ] **Step 1: Define an outbound verifier port**

  Export a DI token plus `RecaptchaVerifierPort.verify(input)`. Keep the Google response shape behind
  the port so the application use-case is provider-agnostic and can distinguish rejected responses
  from transport/provider failures.

- [ ] **Step 2: Implement the Google adapter with strict response parsing**

  `POST https://www.google.com/recaptcha/api/siteverify` as
  `application/x-www-form-urlencoded` using the secret and token. Apply a short timeout (for example,
  three seconds), validate the JSON shape with Zod, and treat non-2xx, malformed JSON, timeouts, and
  non-empty provider error codes as failures. Never log the submitted token or secret.

- [ ] **Step 3: Implement one verification use-case with one public `execute()`**

  The use-case must:

  1. require `success === true`;
  2. require `action === 'booking_checkout'`;
  3. compare `normalizeHostname(result.hostname)` to the hostname used to resolve the tenant;
  4. require `score >= RECAPTCHA_MIN_SCORE` when enforcement is enabled;
  5. throw stable problem codes `CAPTCHA_REJECTED` (`422`) or `CAPTCHA_UNAVAILABLE` (`503`).

  Log only structured diagnostics (`reason`, `score`, `action`, `hostname`) for tuning and incident
  response. Do not log contact details or request tokens.

- [ ] **Step 4: Register the adapter and use-case in `BookingModule`**

  Bind the port token to `GoogleRecaptchaVerifierAdapter` and register
  `VerifyCheckoutRecaptchaUseCase`. Do not create a service class and do not call Google from the
  controller directly.

- [ ] **Step 5: Verify API static checks**

  Run:

  ```bash
  pnpm --filter=@booking/api lint
  pnpm --filter=@booking/api typecheck
  pnpm --filter=@booking/api build
  ```

  Expected: all commands exit `0`; the adapter is the only file aware of `siteverify` and the secret.

### Task 3: Enforce reCAPTCHA before booking creation

**Files:**
- Modify: `apps/api/src/modules/booking/infrastructure/http/public-booking.controller.ts`

**Interfaces:**
- Consumes: `PublicCreateBookingInput` from the validated DTO.
- Produces: the existing `BookingResponse`, error envelope, idempotency behavior, and payment flow.

- [ ] **Step 1: Split transport security data from business data**

  In `create()`, extract `recaptchaToken` and pass the remaining shape to `CreateBookingUseCase` as
  `CreateBookingInput`. Normalize the same `hostOf(req)` value used by tenant resolution.

- [ ] **Step 2: Verify before any booking side effect**

  Call `VerifyCheckoutRecaptchaUseCase.execute()` before `CreateBookingUseCase.execute()`. A rejected
  or unavailable CAPTCHA must not resolve/create a guest, acquire a hold, reserve a promotion, insert
  a booking, emit an outbox event, or initiate a payment.

- [ ] **Step 3: Add a focused endpoint throttle**

  Add `@Throttle` to `POST /public/bookings` with a conservative per-minute value based on current
  checkout traffic. Keep the existing global throttler as the outer safety net and document the chosen
  number beside the decorator.

- [ ] **Step 4: Keep retries idempotent**

  Preserve the incoming `idempotency-key` exactly. CAPTCHA verification happens on each HTTP attempt
  with a fresh token; a successful booking retry still resolves through the existing booking
  idempotency path.

### Task 4: Acquire the token in the checkout UI and pass it through the BFF

**Files:**
- Create: `apps/storefront/app/features/checkout/recaptcha-v3.ts`
- Modify: `apps/storefront/app/features/checkout/components/checkout-form.tsx`
- Modify: `apps/storefront/app/features/checkout/checkout-page.tsx`
- Modify: `apps/storefront/app/routes/checkout.tsx`
- Modify: `apps/storefront/app/lib/booking.server.ts`

**Interfaces:**
- Consumes: public site key from loader data and browser `grecaptcha.execute()`.
- Produces: hidden form field `recaptchaToken`, then `PublicCreateBookingInput` sent server-to-server.

- [ ] **Step 1: Return only the public site key from the checkout loader**

  Add `recaptchaSiteKey` to this route's loader payload. Do not place the secret in root loader data,
  route data, HTML, client bundles, logs, or error messages.

- [ ] **Step 2: Add a browser-safe v3 loader/executor**

  Create a small helper that injects the Google script once, waits for `grecaptcha.ready`, executes
  `booking_checkout`, and returns a token. It must handle slow load, blocked scripts, rejection, and
  repeat submit attempts without duplicate script tags. Use
  `api.js?render=<siteKey>&trustedtypes=true`.

- [ ] **Step 3: Gate form submission on a fresh token**

  Keep React Router `<Form method="post">`. On a valid submit, prevent the first navigation, execute
  reCAPTCHA, add the returned token to `FormData`, and submit with React Router `useSubmit`. Disable
  the button while CAPTCHA or route submission is pending. Preserve native field validation,
  current form values, locale URL, and action/redirect behavior.

- [ ] **Step 4: Validate again in the route action**

  Read `recaptchaToken` from `request.formData()`, combine it with the already validated business
  input, and parse `publicCreateBookingInputSchema`. Missing/oversized tokens return a checkout error
  before the API call. Do not add the token to `buildCheckoutIdempotencyKey()`.

- [ ] **Step 5: Update the server-only API wrapper**

  Change `createBooking()` to accept `PublicCreateBookingInput` and forward it only from the BFF to
  `POST /public/bookings`. Keep all browser-to-backend direct requests prohibited.

- [ ] **Step 6: Preserve the successful payment handoff**

  After booking creation succeeds, leave `checkoutBooking()`, mock-payment behavior, form-post
  allowlisting, redirect allowlisting, recent cookie, and checkout-flow cookie unchanged.

### Task 5: Add localized UX and privacy-safe failure handling

**Files:**
- Modify: `packages/i18n/src/locales/vi/checkout.ts`
- Modify: `packages/i18n/src/locales/en/checkout.ts`
- Modify: `apps/storefront/app/features/checkout/components/checkout-form.tsx`

**Interfaces:**
- Consumes: local client load errors and API codes `CAPTCHA_REJECTED` / `CAPTCHA_UNAVAILABLE`.
- Produces: localized inline guidance with a retry path.

- [ ] **Step 1: Add Vietnamese and English strings**

  Add labels for “verifying,” verification rejected/expired, provider unavailable, and script blocked.
  Translate provider codes through `checkoutError()`; never show raw Google error codes or raw API
  codes to customers.

- [ ] **Step 2: Keep retry recoverable**

  On failure, restore the submit button and let the next click generate a new token. Do not reuse a
  token after any submission because tokens are single-use. Keep customer-entered values in place.

- [ ] **Step 3: Preserve visible reCAPTCHA attribution**

  Keep the standard badge visible. If product later chooses to hide it, add Google's required privacy
  and terms attribution in both locales before changing CSS.

- [ ] **Step 4: Check accessibility**

  Announce CAPTCHA loading/failure through an `aria-live` region, maintain keyboard submission and
  visible focus, and avoid trapping focus or adding a fake disabled payment method.

### Task 6: Document, verify, and roll out

**Files:**
- Modify: `apps/storefront/CLAUDE.md`
- Modify: `docs/architecture.md`

**Interfaces:**
- Produces: an operationally reproducible setup and verification record.

- [ ] **Step 1: Document the security boundary**

  Record browser → React Router action → API verification → booking use-case ordering, environment
  variables, multi-tenant hostname validation, and the rule that the secret/token are never logged.

- [ ] **Step 2: Run the repository verification suite**

  Run:

  ```bash
  pnpm turbo lint typecheck build
  pnpm --filter=@booking/api check:rls
  git diff --check
  ```

  Expected: all commands exit `0`; no test files or test configuration are introduced.

- [ ] **Step 3: Manually verify the running checkout flow**

  With local infrastructure and dedicated development keys configured, verify Vietnamese and English,
  guest and signed-in checkout, and desktop/mobile form submission. Confirm one click creates one
  booking and preserves SePay/mock handoff.

- [ ] **Step 4: Manually exercise failure branches**

  Confirm missing token, expired/duplicate token, wrong action, wrong hostname, score below threshold,
  blocked Google script, and `siteverify` timeout all show recoverable localized errors and create no
  booking/payment side effects. Confirm API logs contain diagnostics but no token, secret, email, or
  phone.

- [ ] **Step 5: Roll out score enforcement safely**

  Deploy first with token/action/hostname validation active and score observation enabled. Review the
  `booking_checkout` score distribution, choose the production threshold, then enable score rejection.
  Monitor CAPTCHA rejection rate, provider-unavailable rate, checkout conversion, booking creation,
  and payment-handoff success; keep rollback limited to score enforcement rather than bypassing token
  validity.

## Acceptance criteria

- Every browser checkout submission carries a fresh v3 token and the API verifies it before any
  booking side effect.
- The API rejects invalid, replayed, wrong-action, wrong-host, and enforced low-score tokens with stable
  codes; provider outages are distinguishable and retryable.
- Tenant subdomains and verified custom domains work with the same platform site key.
- Existing pricing, promotion, booking idempotency, checkout cookies, and payment redirect/form-post
  behavior are unchanged.
- No secret/token is exposed or logged, no browser calls the API directly, and no tests are added.

## References

- Google reCAPTCHA v3: https://developers.google.com/recaptcha/docs/v3
- Server-side token verification: https://developers.google.com/recaptcha/docs/verify
- Domain validation: https://developers.google.com/recaptcha/docs/domain_validation
- FAQ (development keys, badge/privacy, CSP): https://developers.google.com/recaptcha/docs/faq
