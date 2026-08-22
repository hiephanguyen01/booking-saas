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
  // existing methods
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

- [ ] Run/require `pnpm test`, API lint/typecheck, frontend lint/typecheck, and frontend production builds green on final PR3 head.
- [ ] Re-prove `refactor/durable-checkout-payos -> refactor/momo-production-hardening` is ahead-only with `behind_by=0`; sync without force if PR2 moved, then revalidate.
- [ ] Open Draft PR3 `refactor(payments): harden MoMo payment and refund flows` with base `refactor/durable-checkout-payos`.
- [ ] Keep/update Draft validation PR #195 against `main` and require a fresh green current-main workflow on the final head.
- [ ] Record final head SHA, validation run, no migration, no merge/deploy; keep PR3 Draft.