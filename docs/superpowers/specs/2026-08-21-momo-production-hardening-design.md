# MoMo Production Hardening Design

Date: 2026-08-21
Status: Approved in design review
Scope: BookingOS payments bounded context, MoMo only

## 1. Goal

Make the existing MoMo integration production-ready for the tenant-owned-merchant model: each tenant connects its own MoMo Business credentials, BookingOS orchestrates checkout/refund state, and BookingOS never becomes the merchant of record or central settlement account.

The user-facing checkout remains immediate redirect: the customer chooses MoMo and is redirected to MoMo as soon as a payment URL is available. MoMo IPN, not the browser redirect, remains the source of truth for payment completion.

## 2. Non-goals

This change does not:

- convert SePay, PayOS, ZaloPay, or mock to a DB-first lifecycle;
- introduce a central BookingOS MoMo Master Merchant / 3PSP account;
- redesign the payments bounded context or ledger;
- add a new monitoring subsystem;
- add automated test files, test runners, test scripts, or CI test jobs;
- replace the existing outbox-based side-effect model;
- add a schema migration unless implementation reveals an unavoidable invariant that cannot be expressed with existing columns.

## 3. Existing architecture retained

The current payment architecture remains authoritative:

- `controller -> use-case -> repository-port -> repository`;
- tenant-scoped reads/writes use `TenantDbService.forTenant(...)` and RLS;
- gateway-specific behavior stays behind `PaymentGatewayPort` adapters;
- tenant gateway credentials are encrypted at rest and decrypted only when resolving a tenant-bound gateway adapter;
- money is `bigint` VND;
- payment completion is an atomic repository transition plus `payment.succeeded` outbox emission;
- redirect/cancel URLs are UX only; IPN/reconciliation establish payment truth.

The MoMo change is intentionally isolated so existing SePay, PayOS, ZaloPay, and mock behavior is unchanged.

## 4. Chosen approach

### 4.1 MoMo uses DB-first checkout initiation

MoMo is the only gateway in this scope that opts into a persist-first lifecycle.

Conceptually, the payment gateway abstraction gains a checkout-initiation capability such as:

- `persist_first` for MoMo;
- `provider_first` for all existing gateways unless deliberately migrated in a later change.

The application layer must branch on the capability, not on `gateway.key === 'momo'`, so provider-specific knowledge does not leak through `CheckoutUseCase`.

### 4.2 Why MoMo is safe for DB-first

MoMo create-payment can use a BookingOS-generated reference for both `orderId` and `requestId`. BookingOS therefore knows the stable provider reference before the network call.

MoMo AIOv2 POST APIs use `requestId` as the idempotency key. Current MoMo documentation states that duplicate requests may be retried using the same `requestId`, that duplicate in-flight requests can return HTTP 422/result code `7000`, and that a requestId remains unique for the company account for at least 31 days.

Source: https://developers.momo.vn/v3/docs/payment/api/result-handling/idempotency/

## 5. Checkout data flow

### 5.1 Provider-first gateways

SePay, PayOS, ZaloPay, and mock keep their existing checkout flow and semantics.

### 5.2 MoMo persist-first flow

For `momo_wallet` routed to MoMo:

1. Resolve the tenant, booking, active gateway config, amount, and provider payment method inside a tenant transaction.
2. Acquire a transaction-scoped advisory lock for the checkout identity before checking/creating a pending MoMo payment. Follow the repository's existing PostgreSQL pattern using `pg_advisory_xact_lock(hashtext(...))`.
3. Re-check for an existing pending MoMo checkout after the lock is acquired.
4. If one exists:
   - if it already has a valid destination, return it immediately;
   - if it exists without a destination, reuse its stored `gatewayOrderRef` and continue initiation with that same reference.
5. If none exists, create a pending payment before any MoMo network call. Persist:
   - tenant/booking/gateway/kind/amount;
   - `paymentMethod = MOMO_WALLET`;
   - stable `gatewayOrderRef = BKF-...`;
   - a deterministic BookingOS `idempotencyKey` for this checkout attempt;
   - no destination yet.
6. Commit the tenant transaction.
7. Call MoMo `POST /v2/gateway/api/create` outside the database transaction using the persisted `gatewayOrderRef` as both `orderId` and `requestId`.
8. On success, persist the returned normalized destination in a second short tenant transaction and return it to the storefront.
9. The storefront redirects immediately to MoMo.

No database transaction remains open while waiting on the external provider.

## 6. Concurrency and idempotency

### 6.1 Local concurrency

Two storefront requests for the same booking + MoMo wallet must not create two BookingOS payment rows before provider idempotency can help.

The payment repository therefore exposes a narrowly scoped lock operation for checkout initiation, implemented with the same transaction-level advisory-lock pattern already used by the refund repository. The lock key must include enough identity to serialize the relevant checkout attempt without serializing unrelated payments, for example a stable namespace plus booking id and provider payment method.

The sequence is lock -> find pending -> create if missing, all in the same tenant transaction.

### 6.2 Provider concurrency

Once the payment row exists, every create retry reuses the same MoMo `requestId`/`orderId`. Never generate a new MoMo reference because the first request timed out, returned HTTP 422, or had an uncertain response.

### 6.3 Pending checkout repository semantics

`findPendingCheckout(...)` currently only considers a payment reusable when a destination is already persisted. The repository contract must be extended so the application can distinguish:

- no pending checkout;
- pending checkout with no provider destination yet;
- pending checkout with a valid provider destination.

This extension must remain backward-compatible for provider-first gateways.

## 7. MoMo create-payment hardening

The existing `captureWallet` one-step payment model remains.

Required behavior:

- sandbox base URL: `https://test-payment.momo.vn`;
- production base URL: `https://payment.momo.vn`;
- `requestType = captureWallet`;
- `autoCapture = true`;
- `orderId` and `requestId` use the persisted BookingOS MoMo reference;
- minimum network timeout: 30 seconds;
- preserve `bigint` validation before conversion to JavaScript `number`;
- keep signatures generated exactly from MoMo's documented field order;
- treat transport timeout, 5xx, HTTP 422/result `7000`, and other non-final provider states as uncertain rather than as proof of failure.

The current adapter sends `orderExpireTime` with `captureWallet`, while the current One-Time Wallet field table does not document that field. Correctness must not depend on it. Keep or remove it only after sandbox validation against current MoMo behavior; payment safety must be enforced by BookingOS state/IPN/reconciliation regardless.

Source: https://developers.momo.vn/v3/vi/docs/payment/api/wallet/onetime/

## 8. Payment result-code mapping

MoMo result handling must be centralized in a pure MoMo-specific mapper rather than scattered conditionals.

For the current one-step `captureWallet` flow:

- `0` -> succeeded;
- `9000` -> succeeded for one-step/auto-capture payments;
- `1000`, `7000`, `7002` -> pending/uncertain;
- `1005` -> expired;
- definitive final failures such as customer rejection/cancellation or funding/issuer failure -> failed;
- unknown or non-final system states must not be mapped to expired merely because they are non-zero; keep them pending unless the MoMo result-code contract identifies them as a final failure.

This mapper is used consistently by query/reconciliation and any create-response handling where status interpretation is needed.

Source: https://developers.momo.vn/v3/vi/docs/payment/api/result-handling/resultcode/

## 9. IPN hardening

### 9.1 Source of truth

MoMo IPN remains the primary payment-completion signal. The browser redirect must never mark a payment succeeded.

### 9.2 Verification

The tenant-bound MoMo adapter must verify:

- HMAC-SHA256 signature using constant-time comparison;
- `partnerCode` equals the configured tenant MoMo partner code;
- `orderId` resolves to the stored BookingOS payment reference;
- `requestId` is consistent with the BookingOS MoMo create reference for this integration model;
- IPN amount covers/matches the expected BookingOS amount using the existing payment amount guard;
- payload parses to the expected MoMo shape before any state transition.

Do not log secrets, raw secret-bearing credentials, or full signatures.

### 9.3 HTTP acknowledgement

MoMo documents that the merchant endpoint should answer within 15 seconds with HTTP `204 No Content` and no response body.

The webhook controller therefore needs gateway-specific acknowledgement behavior so `/webhooks/momo` returns 204/no body while preserving the existing response shape for other gateways, including ZaloPay-specific behavior.

All expensive cross-module side effects remain asynchronous through the outbox so the IPN response does not wait for booking/finance projections.

Source: https://developers.momo.vn/v3/vi/docs/payment/api/result-handling/notification/

## 10. Query and reconciliation

The existing reconciliation worker remains the recovery mechanism for lost IPNs and uncertain payment state.

For MoMo:

- `queryPaymentStatus` uses a 30-second timeout;
- query uses the persisted provider reference;
- `0` and one-step `9000` reconcile to succeeded;
- `1000`, `7000`, `7002`, and non-final states remain pending;
- `1005` reconciles to expired;
- definitive final failures reconcile to failed only where the existing reconciliation contract supports that transition safely;
- successful query results must preserve MoMo `transId` so a payment recovered without IPN remains refundable;
- amount verification remains mandatory before marking succeeded;
- all writes remain guarded/idempotent so a late IPN and reconciliation can race safely.

Do not create a new worker solely for MoMo.

## 11. Refund hardening

### 11.1 Existing policy retained

BookingOS keeps the existing `automatic_preferred` MoMo refund behavior and the current manual fallback workflow for confirmed unsupported/terminal provider failures.

### 11.2 Timeout and uncertainty

MoMo refund calls use a minimum 30-second timeout.

A timeout, HTTP 5xx, `7000`, `7002`, or another non-final/uncertain outcome must not immediately become `manual_required`, and must not cause BookingOS to issue a different refund attempt blindly.

### 11.3 Refund query

Use MoMo's official:

`POST /v2/gateway/api/refund/query`

with its documented HMAC signature format to determine whether a previously submitted refund completed.

The refund `orderId`/request identity must be deterministic for the BookingOS refund attempt so retries and queries refer to the same logical provider operation.

Expected behavior:

- confirmed successful refund -> complete the BookingOS automatic refund and persist provider refund identity where available;
- processing/uncertain -> keep the refund pending and allow redelivery/reconciliation;
- result `1080` -> confirmed failed attempt may be retried later according to MoMo guidance, using a new provider attempt identity only after the prior attempt is known to be final;
- `1081`, `1088`, or other terminal business rejection -> fall back to the existing manual workflow after checking that the transaction was not already refunded;
- never double-refund because a provider response was lost.

Source: https://developers.momo.vn/v3/docs/payment/api/payment-api/refund/
Source: https://developers.momo.vn/v3/docs/payment/api/result-handling/resultcode/

## 12. Tenant configuration and production safety

Keep the existing dashboard configuration model:

- each tenant owns its MoMo Business account;
- each tenant saves `partnerCode`, `accessKey`, `secretKey`, and `sandbox|production`;
- credentials remain encrypted at rest;
- secrets are not returned to the UI after saving;
- only one active MoMo environment/config is resolved for a tenant.

Production prerequisites:

- `PUBLIC_API_URL` must resolve to a public HTTPS API origin for production MoMo;
- production checkout must not silently use localhost or plain HTTP IPN URLs;
- HMAC verification is authoritative; network IP allowlisting, if used at infrastructure level, is defense in depth only and must follow MoMo's current published outbound-IP list rather than stale hardcoded documentation.

The dashboard setup notes may be updated to state the exact public HTTPS IPN URL requirement and 204 acknowledgement expectation.

## 13. Observability

Use existing application logging; do not add a monitoring platform in this change.

Add structured MoMo operational context where useful:

- tenant id;
- BookingOS payment/refund id;
- gateway order reference;
- operation (`create`, `query`, `ipn`, `refund`, `refund_query`);
- HTTP/provider result code;
- latency/timeout category;
- reconciliation outcome.

Never log `secretKey`, full `accessKey`, decrypted credential blobs, or full signatures.

Operational warnings should cover at least:

- invalid IPN signature/merchant identity;
- amount mismatch;
- create/query/refund timeout;
- prolonged pending payment;
- uncertain refund state;
- production configuration with an invalid public API origin.

## 14. Expected code touch points

The implementation is expected to stay primarily within:

- `apps/api/src/modules/payments/application/use-cases/checkout.use-case.ts`;
- `apps/api/src/modules/payments/domain/ports/payment-gateway.port.ts`;
- `apps/api/src/modules/payments/domain/ports/payment-repository.port.ts`;
- `apps/api/src/modules/payments/infrastructure/repositories/prisma-payment.repository.ts`;
- `apps/api/src/modules/payments/infrastructure/gateways/momo-gateway.adapter.ts`;
- `apps/api/src/modules/payments/infrastructure/http/webhook.controller.ts`;
- `apps/api/src/modules/payments/application/use-cases/handle-webhook.use-case.ts` only if acknowledgement/validation orchestration requires it;
- `apps/api/src/modules/payments/infrastructure/reconciliation.worker.ts` only for MoMo-safe status handling that cannot remain fully inside the adapter;
- the existing refund execution path/ports where refund-query uncertainty must be represented;
- `apps/dashboard/app/features/tenant/components/settings/momo-gateway-card.tsx` only for production setup guidance;
- relevant payment docs if behavior documentation is now stale.

Avoid unrelated refactors.

## 15. Schema and migration policy

The preferred implementation uses existing `payments.gatewayOrderRef`, `gatewayPayload`, `idempotencyKey`, refund fields, and advisory locks, so no database migration is planned.

If implementation reveals that refund-attempt identity cannot be made durable and unambiguous with current refund fields, stop and revise this design before adding schema. Do not hide a new persistence requirement inside an implementation patch.

## 16. Verification policy

Repository policy forbids test files. Do not add `*.spec.*`, `*.test.*`, e2e suites, Jest/Vitest/Playwright configuration, test scripts, or CI test steps.

Static verification must run the repository's full required command:

```bash
pnpm check:no-tests && pnpm check:module-cycles && pnpm check:frontend-structure && pnpm check:theme-tokens && pnpm check:tenant-surfaces && pnpm --filter=@booking/storefront security && pnpm turbo lint typecheck build && pnpm --filter=@booking/api check:rls
```

Runtime UAT must cover:

1. sandbox successful payment;
2. customer cancellation/rejection;
3. expired payment;
4. double-click/concurrent checkout reuse;
5. create timeout followed by same-requestId recovery;
6. duplicate/in-flight MoMo create behavior (`422`/`7000`) without a second payment row;
7. successful payment with browser redirect lost;
8. lost/delayed IPN recovered by query/reconciliation;
9. invalid IPN signature and mismatched partner/order/amount rejected;
10. automatic refund success;
11. uncertain refund resolved via refund query without double-refund;
12. terminal refund failure transitions to the existing manual workflow;
13. one pilot tenant production payment with a small real amount;
14. one pilot tenant production refund;
15. payment -> booking -> settlement convergence after both normal IPN and reconciliation paths.

## 17. Rollout

Roll out tenant-by-tenant:

1. complete sandbox UAT with current MoMo sandbox credentials;
2. obtain/confirm tenant production credentials and public HTTPS IPN reachability;
3. enable production for one pilot tenant;
4. perform a small real payment and verify IPN/payment/booking/finance convergence;
5. perform a real refund and verify provider and BookingOS state converge;
6. monitor logs for invalid signatures, prolonged pending states, and refund uncertainty;
7. enable additional tenants only after the pilot path is stable.

## 18. Acceptance criteria

The design is successfully implemented when all of the following are true:

- MoMo checkout persists one stable BookingOS payment/reference before provider create;
- concurrent/retried MoMo checkout cannot create duplicate BookingOS payments for the same logical pending checkout;
- create retries reuse the same MoMo `requestId`/`orderId`;
- SePay, PayOS, ZaloPay, and mock retain existing checkout behavior;
- MoMo create/query/refund network calls use at least 30-second timeouts where documented;
- MoMo IPN uses constant-time HMAC comparison, validates merchant/reference/amount, and responds 204/no body within the provider deadline;
- result codes no longer collapse every non-`0`/`1000` result to expired;
- lost IPNs and uncertain payment state converge safely through reconciliation;
- uncertain refunds are queried before retry/manual fallback, preventing double-refund;
- tenant credentials remain isolated and encrypted;
- no new test files are introduced;
- the full repository static verification command passes;
- sandbox UAT and one-tenant production pilot demonstrate payment and refund convergence end to end.
