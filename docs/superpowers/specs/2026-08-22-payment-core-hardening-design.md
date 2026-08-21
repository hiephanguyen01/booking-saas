# Payment Core Hardening Design

Date: 2026-08-22
Status: Approved design, pending implementation plan
Scope: Booking SaaS payment core, payOS, MoMo, refund correctness, backward-compatible migration

## 1. Goals

Harden the existing payment subsystem without rewriting it. Keep the current strengths: provider-neutral gateway ports, webhook-as-source-of-truth, atomic payment state transitions, outbox-driven booking/finance fan-out, reconciliation, refund lifecycle, settlement/custody projection, and encrypted credentials.

The production scope is intentionally narrow:

- `bank_transfer` -> payOS
- `momo_wallet` -> MoMo
- `international_card` -> future phase with one provider only
- `zalopay_wallet` -> optional/dormant
- `napas_qr` -> deprecated as a standalone business payment method; legacy records remain readable
- `on_arrival` -> booking collection policy, not a gateway
- `mock` -> dev/test only

No new payment providers are added in this refactor.

## 2. Non-goals

This design does not add VNPay, Apple Pay, Google Pay, ShopeePay, an internal wallet, store credit, a chargeback engine, cross-booking offsets, a new accounting ledger, payout redesign, settlement redesign, or a payment microservice.

## 3. Core design principles

1. One booking may have multiple successful payment transactions, for example deposit and balance.
2. A `Payment` row represents one provider transaction and remains the financial source of truth for that transaction.
3. Webhooks remain the source of truth for settlement; return URLs never mark a payment successful.
4. Provider network calls must not run inside long database transactions.
5. Payment retries must reuse stable persisted request identity.
6. Every new payment must retain the exact gateway configuration revision used to create it.
7. Refunds are planned at booking/business level but executed per source payment.
8. Provider-specific identifiers stay inside adapters; the core does not force one reference format across providers.
9. Legacy payments remain supported during a migration window.

## 4. Durable checkout

The existing checkout flow calls the provider before persisting the local payment while still inside a tenant transaction. The new flow uses the existing `payments` table as the durable checkout intent instead of introducing a separate heavy `PaymentIntent` subsystem.

### Phase A: short database transaction

- resolve tenant and validate storefront state
- load and validate booking
- determine deposit or balance payment
- route customer payment method to an active gateway config revision
- compute expected amount and payment kind
- create or claim one pending `Payment`
- persist a stable idempotency key before any provider call
- persist `gatewayConfigRevisionId`
- commit

### Phase B: provider call outside transaction

- resolve the adapter from the selected config revision
- call `createPayment()` with stable payment identity
- provider adapter derives provider-specific request/order identifiers deterministically from the persisted payment/attempt identity

### Phase C: short database transaction

- attach provider order/transaction references
- attach checkout destination / payment URL / QR handoff
- mark checkout handoff ready
- commit

If a provider times out after accepting the request, the local payment still exists. Retry reuses the same payment and stable provider request identity instead of creating a second provider order.

Financial payment status remains `pending | succeeded | failed | expired`. Provider-handoff lifecycle may be stored separately as checkout metadata/state such as `creating | ready | create_failed`; it must not be conflated with the financial status machine.

## 5. Stable checkout idempotency

The idempotency key must exist before the provider call. It must not be derived from a randomly generated provider result.

A stable key is scoped to the booking payment attempt, payment kind, and customer payment method. The implementation may use the persisted payment ID or an attempt identifier, but retries of the same logical checkout must preserve the same key.

Provider adapters use this stable identity to derive their own request identifiers.

## 6. Immutable gateway configuration revisions

`tenant_gateway_configs` becomes an immutable revision store for credentials/settings/environment.

Saving a gateway configuration no longer overwrites credentials on an existing row. Instead:

1. lock the currently active relevant config
2. deactivate it
3. insert a new row containing new encrypted credentials/settings/environment
4. mark the new row active
5. commit

Old revisions are retained because late webhooks, reconciliation, refunds, and audit may still require them.

The tenant-facing UI continues to behave like a normal "Save gateway settings" screen. Revisioning is an internal backend concern.

### Schema changes

Add to `payments`:

- `gatewayConfigRevisionId UUID NULL`
- `capturedAmount BIGINT NULL`

Add a foreign key from `payments.gatewayConfigRevisionId` to `tenant_gateway_configs.id`.

The revision field is nullable only for backward compatibility with existing payments.

Remove the uniqueness rule that prevents multiple rows for the same `(tenant, gateway, environment)` revision history. Replace it with normal lookup indexes and enforce one active revision using repository locking plus an appropriate PostgreSQL partial unique index where applicable.

## 7. Gateway resolution boundaries

Gateway resolution is split into two explicit paths.

### New checkout

`resolveActiveForCheckout(...)`

- reads the active revision for a new checkout
- returns both adapter/config identity needed to persist the payment revision reference

### Existing payment

`resolveForPayment(payment)`

- if `gatewayConfigRevisionId` exists, load exactly that revision
- otherwise use the temporary legacy fallback to the current matching gateway config

Webhook handling, payment reconciliation, and refund execution use `resolveForPayment()`.

Legacy fallback is centralized in this resolver so migration conditionals do not spread through application use cases.

## 8. Backward-compatible migration

Existing payments have no gateway configuration revision. They remain supported.

Rules during the migration window:

- new payment -> `gatewayConfigRevisionId` required
- legacy payment -> `gatewayConfigRevisionId = null`
- webhook/reconciliation/refund of legacy payment -> fallback to current matching config
- emit/log a legacy-resolution signal so remaining legacy traffic can be measured

A later cleanup change removes the fallback only after there are no relevant pending/refundable legacy transactions within the chosen retention window.

Do not guess or backfill historical config revisions for existing payments.

## 9. Gateway adapter contract

The core owns normalized capabilities:

- `createPayment()`
- `verifyWebhook()`
- `queryPaymentStatus()`
- `refund()`
- `queryRefundStatus()`

Adapters own provider-specific request formats, identifiers, result-code mapping, and endpoints.

The core must not pass a generic `BKF-UUID` reference and require every provider to accept it.

## 10. payOS hardening

### Numeric order code

payOS requires a numeric `orderCode`. The adapter must derive a deterministic numeric provider order code from the persisted payment identity. Retrying the same payment must reuse the same `orderCode`.

The current pattern of converting a `BKF-*` string to `Number(...)` is removed.

### Base URL security

Remove tenant-controlled `baseUrl` from payOS tenant credentials/contracts. Production provider hosts are fixed server-side.

If tests require an alternate endpoint, it is provided through trusted server-only configuration and never through tenant input.

### Provider HTTP behavior

payOS calls use the shared provider HTTP policy described below, including timeout, safe parsing, status validation, retryability classification, and sanitized logging.

## 11. MoMo hardening

MoMo adapter derives stable `orderId` and `requestId` from persisted payment identity. Retrying the same create operation must not generate a new request identity.

MoMo result codes are classified into normalized categories:

- success
- pending/retryable
- final business failure
- authentication/configuration failure

A non-zero result code must not automatically become `expired` or `unsupported`.

### Refund reconciliation

MoMo refund flow uses both:

- `refund()` for creating the refund request
- `queryRefundStatus()` for reconciling the refund request

The system must not infer refund completion by querying only the original payment state.

Each refund row uses a stable refund request identity derived from the persisted refund ID so retries are idempotent.

## 12. Shared provider HTTP policy

Provider adapters use a common infrastructure policy/helper for outbound HTTP concerns:

- explicit timeout / AbortSignal
- HTTP status validation
- defensive response parsing
- redacted/sanitized provider errors
- no credential/secret logging
- retryable vs final error classification
- configuration/authentication error classification

Network timeouts are retryable unless provider semantics prove otherwise. A transient network failure must not mark a financial payment failed or expired.

## 13. Exact captured amount

`Payment.amount` remains the expected amount for the provider-created checkout.

`Payment.capturedAmount` records the amount actually confirmed by the provider.

For the fixed checkout flows in this phase, successful settlement requires exact equality:

`capturedAmount === amount`

Underpayment or overpayment must not silently confirm the booking. Mismatches remain for reconciliation/operator handling.

The current `paid >= expected` rule is replaced for these fixed-amount provider checkouts.

## 14. Multi-payment refunds

A booking can legitimately have multiple successful payment transactions, for example:

- deposit -> MoMo -> succeeded
- balance -> payOS -> succeeded

Therefore a booking-level cancellation refund cannot assume the latest successful payment represents all collected money.

Refund planning becomes two-level:

### RefundBatch

Represents one business refund decision for a booking:

- `id`
- `tenantId`
- `bookingId`
- `requestedAmount`
- `reason`
- `status`

### Refund rows / allocations

Each refund row applies to exactly one source payment:

- `id`
- `refundBatchId`
- `paymentId`
- `amount`
- `status`
- `providerRefundId`
- `providerReference`
- `reason`

Existing refund semantics should be reused where possible; do not rewrite the refund subsystem solely to rename entities.

## 15. Refund allocation

For normal cancellation/service refunds, allocation is deterministic and consumes refundable source payments newest-to-oldest.

For each payment:

`availableRefundable = capturedAmount - successfulRefunds - reservedOrPendingRefunds`

Allocation never exceeds the available refundable amount of a payment.

Refund planning runs under a booking/refund-scope lock inside a short transaction to prevent concurrent double refund allocation.

Provider refund calls execute only after allocations are durably committed and outside that transaction.

## 16. Security deposit refunds

Security deposit is a refundable liability and must preserve its source capture.

`reason = security_deposit` does not use the generic newest-payment allocation rule. It allocates against the payment that actually collected the security deposit.

Cancellation/service refund allocation and security-deposit return are separate business strategies even if both are executed through the same provider refund machinery.

## 17. Refund execution and batch completion

Each refund allocation independently resolves its source payment, historical gateway config revision, and provider adapter.

Normalized provider refund states are:

- `succeeded`
- `pending`
- `failed`
- `unsupported`

`unsupported` moves into the existing manual-refund lifecycle. `pending` is reconciled through `queryRefundStatus()`.

A refund batch is complete only when successful allocation amounts equal the requested amount. A batch with some successful and some pending/manual allocations remains processing/partially completed.

Existing outbox patterns are retained. Do not create unnecessary new event types if aggregation can be implemented using the current event model.

## 18. Balance payment storefront state

A confirmed booking may still be paying its outstanding balance. Therefore `booking.status === confirmed` must not imply that the current balance payment attempt succeeded.

Balance-payment success UI is based on the relevant payment attempt and/or captured totals. Initial deposit confirmation may continue to use booking confirmation as a fallback where appropriate.

## 19. `napas_qr`, ZaloPay, SePay and mock compatibility

### `napas_qr`

- stop offering it as a new standalone customer payment method
- route customer bank transfer/VietQR through `bank_transfer -> payOS`
- keep legacy enum/records readable during migration
- remove schema/contract remnants only in a later cleanup after consumers are verified

### ZaloPay

- remains optional
- receives only compatibility changes required by shared interfaces in this phase
- no new feature investment

### SePay

- remains compatible
- no new capabilities in this phase

### Mock

- dev/test only

## 20. Implementation sequence

### PR 1 — Payment foundation

- additive schema migration
- immutable gateway config revisions
- `gatewayConfigRevisionId`
- active vs historical gateway resolver
- legacy fallback and observability

Do not yet perform the large checkout behavior refactor.

### PR 2 — Durable checkout + payOS

- persist/claim payment before provider call
- provider network outside checkout DB transaction
- stable checkout idempotency
- deterministic numeric payOS order code
- remove tenant-controlled payOS base URL
- shared provider timeout/error policy

### PR 3 — MoMo production hardening

- stable order/request identity
- result-code classification
- refund status query
- timeouts and retry behavior
- historical config revision usage

### PR 4 — Refund allocation

- `RefundBatch`
- multi-payment allocation
- refundable-amount accounting
- concurrency locking
- security-deposit source allocation
- partial/manual aggregation

### PR 5 — Storefront and cleanup

- balance payment result state
- hide/deprecate `napas_qr`
- storefront payment labels
- safe removal of obsolete conditional paths

International cards are not part of these PRs.

## 21. Verification scenarios

The refactor is not complete until the following are verified with the repository's allowed local/runtime verification approach.

### Checkout

- double click checkout
- concurrent identical checkout requests
- provider accepts then client call times out
- retry reuses the same payment identity
- duplicate webhooks
- webhook after credential rotation
- stale pending reconciliation

### payOS

- create QR/payment link
- successful webhook
- invalid signature
- amount mismatch
- expiry
- retry create with same payment identity

### MoMo

- create payment
- successful webhook
- status query
- provider/network timeout
- duplicate callback
- credential rotation
- full refund
- partial refund
- pending refund followed by refund-status query
- refund retry with stable request identity

### Multi-payment booking

- deposit through MoMo
- balance through payOS
- cancellation requiring refund from both captured payments

### Security deposit

- service completion with security-deposit return
- refund is allocated only against the source capture containing the security deposit

## 22. Definition of done

The payment refactor is considered complete when all of the following are true:

1. checkout provider network calls no longer run inside the checkout DB transaction
2. every new payment records the gateway config revision used to create it
3. credential rotation does not break webhook/reconciliation/refund for revisioned payments
4. payOS uses a valid deterministic numeric order code
5. tenant-controlled payOS base URL is removed
6. MoMo checkout retry uses stable request identity
7. MoMo refund has dedicated refund-status reconciliation
8. fixed-amount provider checkout enforces exact captured amount
9. a booking with multiple successful payments can be refunded correctly across source transactions
10. security-deposit refund uses the correct source payment
11. balance payment UI does not report success solely because the booking is already confirmed
12. legacy payments remain supported during the migration window
13. no payment provider is added outside the agreed scope

After these conditions hold, the payment core should be stable enough to add one international-card provider later without another core architectural rewrite.
