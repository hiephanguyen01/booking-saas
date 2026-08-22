# MoMo Production Hardening Implementation Plan

> **Execution:** Follow Superpowers executing-plans + TDD. Repository ADR 0009 allows only `apps/api/src/**/*.use-case.spec.ts` and `tests/architecture/*.test.ts`; provider/worker runtime behavior must therefore use disposable CI proof workflows, removed before final PR3 diff.

**Goal:** Make MoMo checkout and refunds retry-safe and provider-correct with stable operation identities, explicit result-code classification, bounded HTTP, dedicated refund-status reconciliation, and historical gateway-config resolution.

**Base:** PR2 head `52e48156a862625ba98a022724f3722eebe71991`.

**Constraints:** no force updates to PR1/PR2; no merge/deploy; no provider I/O inside tenant transactions; no Prisma migration; exact-amount settlement remains unchanged; pending refunds are queried with MoMo `/v2/gateway/api/refund/query`, never inferred from original-payment status.

## Task 1 — Pending webhook semantics

- [x] Add a sanctioned use-case RED case proving a non-final `pending` event must not call `markTerminal`.
- [x] Confirm RED on CI #721: expected `['find']`, received `['find','markTerminal']`.
- [x] Add `pending` to `WebhookEvent` and make `Payment.decideWebhookTransition()` ignore `pending` and `refunded`.
- [x] Confirm GREEN on CI #723: Tests, API lint/typecheck, frontend lint/typecheck, and production builds all passed.

## Task 2 — Normalized refund contract + automatic-refund lifecycle

**Files:** `payment-gateway.port.ts`, all gateway adapters, `refund-repository.port.ts`, `prisma-refund.repository.ts`, `execute-automatic-refund.use-case.ts`, `execute-automatic-refund.use-case.spec.ts`.

**Target contract:**

```ts
export interface RefundInput {
  refundId: string;
  gatewayTxnId: string;
  gatewayOrderRef: string;
  amountVnd: bigint;
  reason: string;
}

export type RefundProviderStatus = 'succeeded' | 'pending' | 'failed' | 'unsupported';
export interface RefundResult { status: RefundProviderStatus; refundId?: string }
export interface RefundStatusInput { refundId: string; gatewayRefundId: string | null }
export type RefundStatusResult = RefundResult;

export interface PaymentGatewayPort {
  refund(input: RefundInput): Promise<RefundResult>;
  queryRefundStatus(input: RefundStatusInput): Promise<RefundStatusResult>;
}
```

Repository additions:

```ts
markAutomaticPending(tx, id, gatewayRefundId): Promise<RefundRecord | null>;
failAutomatic(tx, id, gatewayRefundId): Promise<RefundRecord | null>;
findPendingAutomatic(limit): Promise<Array<{ id: string; tenantId: string }>>;
```

- [x] Convert `execute-automatic-refund.use-case.spec.ts` first and add RED cases for succeeded, pending, already-pending query, failed, unsupported, stable local `refundId`, and historical config revision.
- [x] Confirm RED on fresh CI #725: 8 failures in `execute-automatic-refund.use-case.spec.ts` exposed the old `supported`/payment-status fallback implementation.
- [x] Implement the normalized gateway contract and compile-compatible SePay/payOS/ZaloPay/mock methods.
- [x] Update MoMo to compile against the contract; provider-specific semantics are completed in Task 3.
- [x] Replace the original-payment `queryPaymentStatus(...) === 'refunded'` fallback. If `gatewayRefundId` exists, call `queryRefundStatus()`; otherwise call `refund()` with the durable local `refund.id`.
- [x] Apply results under the existing booking lock: succeeded -> complete + `refund.completed`; pending -> preserve/persist provider ref; failed -> mark failed; unsupported -> manual + `refund.requested`.
- [x] Preserve an existing provider reference with `result.refundId ?? current.gatewayRefundId ?? prepared.refund.gatewayRefundId`.
- [x] Implement guarded repository writes and `findPendingAutomatic()` using the admin pool.
- [x] Confirm GREEN with full repository CI #732: Tests, API lint/typecheck, frontend lint/typecheck, and production builds all passed.

## Task 3 — MoMo provider hardening

**File:** `momo-gateway.adapter.ts` plus a disposable proof workflow. No permanent adapter spec is allowed by ADR 0009.

Stable IDs:

```ts
function momoId(prefix: 'MO'|'MC'|'MQ'|'RF'|'RR'|'RQ', value: string): string {
  return `${prefix}${createHash('sha256').update(`${prefix}:${value}`).digest('hex').slice(0, 32)}`;
}
```

Use `MO(paymentId)` for persisted orderId, `MC(paymentId)` for create requestId, `MQ(orderId)` for payment query, `RF(refundId)` for refund orderId, `RR(refundId)` for refund requestId, and `RQ(refundId)` for refund query requestId.

Provider rules:
- `0` success.
- `9000` payment success for one-step `autoCapture=true`.
- `1000/7000/7002` pending.
- `1005` expired for payment state/webhook.
- `11/12/13` outbound configuration failures.
- `10/43/47/1080` outbound retryable failures.
- `1088` terminal refund failure.
- `1081` refund create ambiguity: immediately reconcile with dedicated refund query.
- signed non-final/system callbacks map to `pending`, never local financial failure solely because the result code is non-zero.

- [x] Add a temporary `.github/workflows/momo-proof.yml` targeting PR3/main validation and make its runtime script prove stable IDs, requestId <= 50, orderId regex, create/query/refund/refund-query URLs/signatures, result-code categories, `1081` query recovery, network retry classification, and 30-second provider timeout wiring.
- [x] Run the proof in RED against current MoMo behavior. After fixing the proof loader itself, proof run #2 exposed the intended behavioral gaps: unstable operation IDs, wrong `9000/7000` classification, missing refund query/recovery, missing provider error kinds, missing production callback guard, and incomplete timeout wiring.
- [x] Implement all four MoMo outbound calls with existing `providerJson(..., timeoutMs: 30_000)` and defensive `unknown` parsers.
- [x] Implement deterministic operation IDs and result-code classification.
- [x] Implement `POST /v2/gateway/api/refund/query` using signing source `accessKey=$accessKey&orderId=$orderId&partnerCode=$partnerCode&requestId=$requestId`; match the deterministic refund order ID in `refundTrans`; if absent after a successful query, return pending.
- [x] Rerun proof GREEN on proof run #4, then delete the disposable proof workflow. Standard CI #741 passed all gates after deletion.

## Task 4 — Pending-refund reconciliation sweep

**Files:** `reconciliation.worker.ts`; no permanent worker spec is allowed by ADR 0009.

- [x] Add pending automatic refunds to the disposable runtime proof: `findPendingAutomatic()` returns `{id, tenantId}` and the worker delegates each item to `ExecuteAutomaticRefundUseCase.execute(tenantId, refundId)` without provider logic in the worker.
- [x] Confirm behavioral RED on proof run #6 after generating the Prisma client: pending scan limit stayed `null`, `findPendingAutomatic()` was never called, and the delegation list was empty.
- [x] Inject `ExecuteAutomaticRefundUseCase` and delegate pending refunds after stale-payment reconciliation, catching/logging each item independently.
- [x] Confirm proof GREEN on proof run #7, including item-failure isolation; remove the proof workflow before final diff. Standard CI #741 passed after cleanup.

## Task 5 — Final stacked PR3 validation

- [x] Final cleanup head `6b5cae3f0588748a6fb1f60ed2b5adb7ca700b65` passed Frontend CI #745: tests, API lint/typecheck, frontend lint/typecheck, production builds.
- [x] Re-proved `refactor/durable-checkout-payos -> refactor/momo-production-hardening` ahead-only with `ahead_by=29`, `behind_by=0`, merge base exactly PR2 head.
- [x] Opened stacked Draft PR3 #196 with base `refactor/durable-checkout-payos`.
- [x] Updated Draft validation PR #195 against `main`; current `main` remained `2a837bf0ab74bb309774e5152c151b3266c7dfd6` at verification time.
- [x] Review found and fixed a SePay duplicate-void crash-recovery regression; disposable proof RED→GREEN then removed; final diff remained 15 files with no Prisma migration.

## Sandbox UAT gate

Live MoMo Sandbox UAT executed and **100% PASSED (12/12 Cases)** on 2026-08-23.

### Test Environment & Execution Details
- **Architecture**: Local NestJS API (`:3000`) + PostgreSQL 16 + Redis 7 + Cloudflare HTTPS Tunnel (`https://tuner-affecting-drawings-worthy.trycloudflare.com`)
- **Target Gateway**: Real MoMo Sandbox Server (`https://test-payment.momo.vn`)
- **Tenant**: `studiohub` (Tenant-owned Sandbox credentials configured and encrypted in `tenant_gateway_configs`)

### 12-Case UAT Matrix Verification Results
1. [x] **Case 1: Checkout Initiation & Real MoMo PayUrl** — Generated live `https://test-payment.momo.vn/v2/gateway/pay?t=...` with persistent payment in DB.
2. [x] **Case 2: Storefront Redirect URL** — Returned `redirect` destination type with valid return/cancel URL paths.
3. [x] **Case 3: Real IPN Webhook Processing** — Valid HMAC-SHA256 signature accepted, returned HTTP ACK, updated status to `succeeded`, stored `gatewayTxnId`.
4. [x] **Case 4: Customer Cancel/Reject IPN** — Webhook with `resultCode: 1006` recorded as `failed` payment.
5. [x] **Case 5: Expiry ResultCode** — Webhook with `resultCode: 1005` recorded as `expired` payment.
6. [x] **Case 6: Concurrent Checkout (Double-Click)** — PostgreSQL advisory transaction lock ensured single payment row created and identical `paymentId` returned.
7. [x] **Case 7: Idempotent Retry** — Reused stable `orderRef` / `requestId` without duplicate payment creation.
8. [x] **Case 8: Direct MoMo Status Query** — MoMo `/v2/gateway/api/query` returned HTTP 200 with `resultCode: 1000` (Pending customer confirmation).
9. [x] **Case 9: Tampered Webhook & Invalid Signature Guards** — Fake signatures and tampered amounts rejected safely without state corruption.
10. [x] **Case 10: MoMo Refund API Execution** — Direct MoMo `/v2/gateway/api/refund` returned HTTP 200 with signature validation.
11. [x] **Case 11: MoMo Refund Query API** — MoMo `/v2/gateway/api/refund/query` returned HTTP 200 with refund status verification.
12. [x] **Case 12: Result Code Classification** — Verified mappings for `0`, `9000`, `1005`, `1006`, `1001`, `7000`, `1080`, `1081`, `1088`.

All static and runtime checks passed (`pnpm test`, typecheck, lint, build, RLS check). Gate ready for staging deployment and smoke verification.
