# MoMo Production Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring MoMo checkout, webhook/query, and automatic refund behavior onto the hardened payment-core contract: stable mutating request identity, historical gateway revision usage, bounded HTTP, explicit result-code classification, and dedicated refund-status reconciliation.

**Architecture:** The local `Payment.id` and `Refund.id` are the canonical identities for MoMo mutating operations. Payment create uses deterministic `orderId`/`requestId`; refund create uses a distinct deterministic refund `orderId`/`requestId`. Status-query calls are read-only and intentionally use a fresh query `requestId` so polling can observe state changes rather than replay one idempotent query response. A pure MoMo result-code classifier maps provider codes to normalized payment/refund dispositions. Pending/non-final provider codes do not mutate financial state to failed/expired. Refund reconciliation calls `/v2/gateway/api/refund/query`, never the original payment query endpoint.

**Tech Stack:** NestJS 11, native `crypto`, MoMo AIO v2 REST API, shared `provider-http.ts` from PR2, Prisma/PostgreSQL, BullMQ reconciliation, pnpm/Turbo.

**Spec:** `docs/superpowers/specs/2026-08-22-payment-core-hardening-design.md`

**Official provider references:**
- API idempotency: `https://developers.momo.vn/v3/docs/payment/api/result-handling/idempotency/`
- Result codes: `https://developers.momo.vn/v3/docs/payment/api/result-handling/resultcode/`
- Payment query: `https://developers.momo.vn/v3/docs/payment/api/payment-api/query/`
- Refund + refund query: `https://developers.momo.vn/v3/docs/payment/api/payment-api/refund/`

## Global Constraints

- PR1 and PR2 must land first; reuse `resolveForPayment()`, durable checkout, exact amount matching, and `provider-http.ts`.
- No automated tests/test runners. Use static gates and focused real runtime/sandbox smoke per ADR 0005.
- MoMo one-time wallet checkout is the only wallet capability hardened here. Do not add card/ATM/token-binding flows.
- MoMo mutating POST retries use the same persisted operation identity. The provider documents `requestId` as the idempotency key and retains uniqueness for at least 31 days.
- Payment create identifiers:
  - `orderId = PAY-<payment UUID without dashes>`
  - `requestId = PCR-<payment UUID without dashes>`
- Refund create identifiers:
  - `orderId = REF-<refund UUID without dashes>`
  - `requestId = RCR-<refund UUID without dashes>`
- All identifiers remain under MoMo's request-ID length and order-ID regex constraints.
- Payment/refund **query** calls use fresh query request IDs (for example `PQR-<uuidv7 hex>` / `RQR-<uuidv7 hex>`). Query calls are read-only; reusing the create/refund `requestId` is forbidden because AIOv2 POST request IDs are globally idempotent and could replay stale operation semantics.
- Minimum timeout for MoMo payment query and refund API calls is 30 seconds per provider docs. Use the shared HTTP helper with `timeoutMs >= 30_000`.
- Result code `0` is success.
- `1000`, `7000`, and `7002` are pending/non-final.
- `9000` is treated as succeeded only for this adapter's one-step `autoCapture=true` flow, matching MoMo's documented one-step guidance.
- `1005` is the only explicitly mapped payment `expired` code in this plan; final customer/business failures such as `1001`, `1002`, `1003`, `1004`, `1006`, `1007`, `1017`, `1026`, `4001`, `4002`, `4100` map to `failed`, not `expired`.
- Non-final merchant/system codes (`10`, `11`, `12`, `13`, `20`, `21`, `22`, `40`, `41`, `42`, `43`, `45`, `47`) must not be blindly converted to terminal payment status. Classify configuration/integration/retry conditions explicitly and keep the financial payment pending unless a documented final state is known.
- Refund codes `7000`/`7002` remain pending and are polled through refund query.
- Refund code `1080` is a final failed refund attempt with provider guidance to retry later. In this phase, do not create a hidden second provider refund attempt under a new request identity. First reconcile the same refund order; if still `1080`, persist `failed` and require explicit operator/retry design rather than looping automatically.
- Refund code `1081` must be reconciled via `refund/query` before deciding final failure, because the original transaction might already have been refunded.
- Refund code `1088` maps to `unsupported`/manual-required because the original transaction is not provider-refundable.
- Webhook remains source of truth for payment success; return URL never marks success.
- Exact amount equality from PR2 remains mandatory.
- No merge/deploy without separate authorization.

## File Map

**Provider contract / classifier**
- Modify `apps/api/src/modules/payments/domain/ports/payment-gateway.port.ts` — add pending webhook event, normalized refund result/query contract, local refund identity input.
- Create `apps/api/src/modules/payments/infrastructure/gateways/momo-result-code.ts` — pure result-code classification.
- Modify `apps/api/src/modules/payments/infrastructure/gateways/momo-gateway.adapter.ts` — stable IDs, shared HTTP helper, query/refund-query, safe HMAC comparison.
- Modify `apps/api/src/modules/payments/infrastructure/gateways/{mock,sepay,payos,zalopay}-gateway.adapter.ts` only for interface compatibility.

**Refund persistence/execution/reconciliation**
- Modify `apps/api/src/modules/payments/domain/ports/refund-repository.port.ts` — mark failed + discover stale automatic pending refunds.
- Modify `apps/api/src/modules/payments/infrastructure/repositories/prisma-refund.repository.ts` — guarded failure write and admin-pool reconciliation projection.
- Modify `apps/api/src/modules/payments/application/use-cases/execute-automatic-refund.use-case.ts` — normalized result handling, no original-payment query fallback.
- Modify `apps/api/src/modules/payments/infrastructure/reconciliation.worker.ts` — query pending automatic refunds through `queryRefundStatus()`.

**Payment handling**
- Modify `apps/api/src/modules/payments/domain/entities/payment.entity.ts` only if `pending` webhook transition needs an explicit domain decision.
- Modify `apps/api/src/modules/payments/application/use-cases/handle-webhook.use-case.ts` only for `pending` event/log handling if the shared transition path needs it.

---

### Task 1: Evolve the gateway contract for pending events and refund-status reconciliation

**Target contract direction:**

```ts
export type WebhookEvent = 'pending' | 'succeeded' | 'failed' | 'expired' | 'refunded';

export type GatewayRefundStatus = 'succeeded' | 'pending' | 'failed' | 'unsupported';

export interface RefundInput {
  refundId: string;
  gatewayTxnId: string;
  gatewayOrderRef: string;
  amountVnd: bigint;
  reason: string;
}

export interface RefundResult {
  status: GatewayRefundStatus;
  providerRefundId?: string;
  providerReference?: string;
  retryable?: boolean;
}

export interface RefundStatusQueryInput {
  refundId: string;
  providerReference?: string;
}

export interface RefundStatusResult {
  status: Exclude<GatewayRefundStatus, 'unsupported'>;
  providerRefundId?: string;
  providerReference?: string;
  retryable?: boolean;
}

export interface PaymentGatewayPort {
  // existing methods...
  refund(input: RefundInput): Promise<RefundResult>;
  queryRefundStatus(input: RefundStatusQueryInput): Promise<RefundStatusResult>;
}
```

- [ ] **Step 1: Add `pending` to `WebhookEvent`.**

Update `Payment.decideWebhookTransition()` so `pending` is explicitly ignored, exactly like an informative non-terminal provider observation. Do not make `pending` a persisted financial PaymentStatus.

- [ ] **Step 2: Replace boolean refund support with normalized status.**

Remove call-site logic that assumes `supported=false` means “query original payment”.

- [ ] **Step 3: Add `refundId` to `RefundInput`.**

Adapters must derive the mutating provider refund identity from the durable local refund row, not from `gatewayOrderRef + reason`.

- [ ] **Step 4: Add `queryRefundStatus()`.**

For providers without a refund-status API:
- return a compile-compatible `failed/unsupported` behavior appropriate to that provider's existing manual lifecycle;
- do not invent provider success.

Keep compatibility edits minimal for SePay/payOS/ZaloPay/mock; only MoMo receives full implementation here.

- [ ] **Step 5: Verify compile impact and commit.**

```bash
pnpm --filter=@booking/api lint
pnpm --filter=@booking/api typecheck

git add apps/api/src/modules/payments/domain/ports/payment-gateway.port.ts \
  apps/api/src/modules/payments/domain/entities/payment.entity.ts \
  apps/api/src/modules/payments/infrastructure/gateways/mock-gateway.adapter.ts \
  apps/api/src/modules/payments/infrastructure/gateways/sepay-gateway.adapter.ts \
  apps/api/src/modules/payments/infrastructure/gateways/payos-gateway.adapter.ts \
  apps/api/src/modules/payments/infrastructure/gateways/zalopay-gateway.adapter.ts
git commit -m "refactor(payments): normalize refund gateway lifecycle"
```

---

### Task 2: Create a pure MoMo result-code classifier

**Create:** `apps/api/src/modules/payments/infrastructure/gateways/momo-result-code.ts`.

**Produces:**

```ts
export type MomoPaymentDisposition =
  | { kind: 'succeeded' }
  | { kind: 'pending' }
  | { kind: 'expired' }
  | { kind: 'failed' }
  | { kind: 'retryable' }
  | { kind: 'configuration' };

export type MomoRefundDisposition =
  | { kind: 'succeeded' }
  | { kind: 'pending' }
  | { kind: 'failed'; retryable: boolean }
  | { kind: 'unsupported' }
  | { kind: 'configuration' };

export function classifyMomoPaymentResult(code: number): MomoPaymentDisposition;
export function classifyMomoRefundResult(code: number): MomoRefundDisposition;
```

- [ ] **Step 1: Encode exact named sets, not `if code !== 0 then expired`.**

Payment rules:

```text
0, 9000                       -> succeeded (9000 because this adapter is one-step autoCapture=true)
1000, 7000, 7002             -> pending
1005                          -> expired
1001,1002,1003,1004,
1006,1007,1017,1026,
4001,4002,4100,98,99         -> failed
10,40,41,42,43               -> retryable / non-terminal
11,12,13,20,21,22,45,47      -> configuration/integration; non-terminal financial state
unknown                       -> retryable/unknown-safe, never silently expired
```

If provider documentation changes during implementation, update the named sets and document the source/date in code comments; do not widen a terminal set from guesswork.

- [ ] **Step 2: Encode refund-specific rules.**

```text
0                  -> succeeded
7000,7002,10,43    -> pending
1080               -> failed, retryable=false in automatic loop (operator explicit retry later)
1081               -> failed candidate, but caller must query refund order before persisting failure
1088               -> unsupported
11,12,13,20,21,22,
40,41,42,45,47     -> configuration/integration
98,99 and unknown  -> failed/review; do not call original payment query
```

Use a small explicit helper/flag for the `1081` “reconcile before terminal” case if needed rather than hiding it in `failed`.

- [ ] **Step 3: Keep the classifier framework-free.**

No Nest, fetch, Prisma, environment, logging, or credentials imports.

- [ ] **Step 4: Verify with a disposable one-line/node/tsx invocation rather than a committed test file.**

Manually print representative classifications for `0,1000,1005,7000,9000,1080,1081,1088,999999` and compare with the official MoMo result-code table.

- [ ] **Step 5: Commit.**

```bash
git add apps/api/src/modules/payments/infrastructure/gateways/momo-result-code.ts
git commit -m "refactor(payments): classify momo result codes"
```

---

### Task 3: Make MoMo payment create identity stable and move all MoMo HTTP onto the shared policy

**File:** `momo-gateway.adapter.ts`.

- [ ] **Step 1: Implement deterministic payment reference.**

```ts
prepareOrderReference(paymentId: string): string {
  return `PAY-${paymentId.replaceAll('-', '')}`;
}
```

`createPayment()` must verify the persisted `gatewayOrderRef` equals the deterministic value for the given `paymentId` before signing.

Use:

```ts
const orderId = input.gatewayOrderRef;
const requestId = `PCR-${input.paymentId.replaceAll('-', '')}`;
```

Do not use a fresh UUID/random ID on retry.

- [ ] **Step 2: Keep current one-time wallet semantics explicit.**

Use `requestType='captureWallet'` and `autoCapture=true` as today. Do not silently switch products.

- [ ] **Step 3: Use `providerJson()` with minimum 30-second timeout.**

Apply to:
- `/v2/gateway/api/create`
- `/v2/gateway/api/query`
- `/v2/gateway/api/refund`
- `/v2/gateway/api/refund/query`

The adapter's sandbox/production base hosts remain server-controlled constants.

- [ ] **Step 4: Classify create response.**

- success -> require a valid `payUrl`, return ready handoff;
- pending/retryable (`7000`, analogous processing, transport timeout) -> throw retryable gateway error so local checkout remains `creating` and the same requestId is reused;
- configuration/integration -> final checkout-create error (`create_failed`) with sanitized log/error;
- provider final create failure -> final checkout-create error;
- never map a nonzero code generically to expired.

A duplicate/in-progress response after a concurrent same-request retry is not a reason to create a new Payment row.

- [ ] **Step 5: Query payment status with a fresh read request ID.**

```ts
const requestId = `PQR-${uuidv7().replaceAll('-', '')}`;
```

Sign the query per MoMo docs and classify result:
- `0`/one-step `9000` -> `succeeded`;
- pending/retryable/configuration -> return `pending` or throw a classified non-terminal GatewayRequestError; do not mutate to expired;
- `1005` -> `expired`;
- documented final failure -> `failed`.

Return `transId` when present so reconciliation can persist it.

- [ ] **Step 6: Use constant-time HMAC comparison.**

Convert expected/actual HMAC hex into Buffers only after validating equal-length hex format; compare via `timingSafeEqual`. Invalid/malformed signatures return `valid:false` without throwing credential-bearing details.

- [ ] **Step 7: Classify webhook result code using the same payment classifier.**

Map:
- succeeded -> webhook `succeeded`;
- pending/retryable/configuration -> webhook `pending` (plus sanitized operational log for configuration/integration codes if useful);
- expired -> `expired`;
- failed -> `failed`.

Exact amount guard remains in the application use case from PR2.

- [ ] **Step 8: Verify stable create identity with sandbox/runtime smoke.**

Capture/log only non-secret identifiers:
1. call checkout twice for same local payment;
2. confirm same local payment ID, MoMo orderId, and create requestId;
3. force/demonstrate a retryable transport or duplicate-in-progress condition if feasible;
4. confirm no second local payment is created for the same durable attempt;
5. query payment status with distinct query request IDs across polls.

- [ ] **Step 9: Commit.**

```bash
git add apps/api/src/modules/payments/infrastructure/gateways/momo-gateway.adapter.ts \
  apps/api/src/modules/payments/application/use-cases/handle-webhook.use-case.ts
git commit -m "fix(payments): make momo checkout retry safe"
```

---

### Task 4: Implement MoMo refund create and dedicated refund query

**File:** `momo-gateway.adapter.ts`.

- [ ] **Step 1: Derive refund identifiers only from local Refund.id.**

```ts
const refundHex = input.refundId.replaceAll('-', '');
const orderId = `REF-${refundHex}`;
const requestId = `RCR-${refundHex}`;
```

They are stable across retries of the same local refund and distinct from payment-create IDs.

- [ ] **Step 2: Call `/v2/gateway/api/refund` with 30-second minimum timeout.**

Sign using the exact provider field order. Do not log the signature or secret material.

- [ ] **Step 3: Normalize refund response.**

Return:
- code `0` -> `{status:'succeeded', providerRefundId:String(transId), providerReference:orderId}`;
- `7000`/`7002`/pending -> `{status:'pending', providerReference:orderId}`;
- `1088` -> `{status:'unsupported', providerReference:orderId}`;
- `1081` -> immediately call the dedicated `queryRefundStatus({refundId, providerReference:orderId})`; if query reports success, reconcile success; if it reports final failure, return failed;
- `1080` -> query once to rule out contradictory success, then return final failed if still failed;
- configuration/final codes -> normalized failed/configuration handling, never original-payment query fallback.

- [ ] **Step 4: Implement `/v2/gateway/api/refund/query`.**

Use the refund order ID as the queried `orderId`. Generate a fresh read-only query request ID:

```ts
const requestId = `RQR-${uuidv7().replaceAll('-', '')}`;
```

This requestId is intentionally not persisted/reused because the query has no side effect and must observe changing refund state.

Map response via the refund classifier. Return provider refund `transId` when available.

- [ ] **Step 5: Prove the original payment query is no longer part of refund reconciliation.**

Search after implementation:

```bash
rg "queryPaymentStatus" apps/api/src/modules/payments/application/use-cases/execute-automatic-refund.use-case.ts \
  apps/api/src/modules/payments/infrastructure/gateways/momo-gateway.adapter.ts
```

Expected: the automatic-refund use case does not call payment query as a refund fallback. MoMo adapter's payment-query method remains only for payment reconciliation.

- [ ] **Step 6: Commit.**

```bash
git add apps/api/src/modules/payments/infrastructure/gateways/momo-gateway.adapter.ts
git commit -m "fix(payments): reconcile momo refunds explicitly"
```

---

### Task 5: Persist automatic-refund terminal/pending outcomes and discover stale pending refunds

**Files:** refund repository port/implementation.

**Add:**

```ts
export interface PendingAutomaticRefundRef {
  id: string;
  tenantId: string;
  paymentId: string;
  bookingId: string;
  amount: bigint;
  reason: string | null;
}

markAutomaticFailed(tx: PrismaTx, id: string): Promise<RefundRecord | null>;
findStaleAutomaticPending(olderThanSec: number, limit: number): Promise<PendingAutomaticRefundRef[]>;
```

- [ ] **Step 1: Implement guarded failed transition.**

```ts
UPDATE refunds
SET status='failed', updated_at=now()
WHERE id=? AND status='pending' AND execution_mode='automatic'
```

Return `null`/current record according to existing CAS conventions; do not overwrite succeeded/manual states.

- [ ] **Step 2: Implement admin-pool stale pending projection.**

Query only:
- `status='pending'`;
- `execution_mode='automatic'`;
- older than a conservative interval, default 60 seconds or an env-backed value such as `REFUND_RECONCILE_STALE_SEC`;
- order oldest first;
- bounded limit.

No tenant-secret/config data leaves the repository.

- [ ] **Step 3: Do not add a new RefundStatus enum value.**

Existing `pending|succeeded|failed|manual_required` is sufficient for PR3.

- [ ] **Step 4: Verify and commit.**

```bash
pnpm --filter=@booking/api lint
pnpm --filter=@booking/api typecheck

git add apps/api/src/modules/payments/domain/ports/refund-repository.port.ts \
  apps/api/src/modules/payments/infrastructure/repositories/prisma-refund.repository.ts
git commit -m "refactor(payments): persist automatic refund outcomes"
```

---

### Task 6: Rewrite automatic refund execution around normalized refund results

**File:** `execute-automatic-refund.use-case.ts`.

- [ ] **Step 1: Preserve the PR1 prepare/network/persist split.**

Short TX:
- load refund by ID;
- ensure `Refund.canExecuteAutomatically()`;
- load exact `refund.paymentId` source payment;
- resolve historical gateway revision/settings;
- compute manual SLA.

No provider network call in the TX.

- [ ] **Step 2: Pass local `refund.id` into gateway refund.**

```ts
const result = await gateway.refund({
  refundId: refund.id,
  gatewayTxnId: ...,
  gatewayOrderRef: ...,
  amountVnd: refund.amount,
  reason: refund.reason ?? 'booking_cancellation',
});
```

- [ ] **Step 3: Delete the current `!supported -> queryPaymentStatus(original payment)` fallback.**

That inference is invalid for MoMo refunds.

- [ ] **Step 4: Persist normalized outcomes in a short TX under the existing refund booking lock.**

- `succeeded` -> `completeAutomatic()` + existing `refund.completed` outbox;
- `pending` -> leave refund `pending`; no completion/manual event yet;
- `unsupported` -> `requireManual()` + existing `refund.requested` outbox;
- `failed` final -> `markAutomaticFailed()`; log an operator-visible failure signal; do not emit `refund.completed`;
- transport/retryable GatewayRequestError -> leave pending so reconciliation/retry can recover.

Do not mark manual merely because a transient request failed.

- [ ] **Step 5: Keep outbox semantics idempotent.**

Only the first guarded successful/manual transition emits the corresponding event.

- [ ] **Step 6: Commit.**

```bash
git add apps/api/src/modules/payments/application/use-cases/execute-automatic-refund.use-case.ts
git commit -m "refactor(payments): handle normalized refund results"
```

---

### Task 7: Reconcile stale automatic refunds using the source payment's historical MoMo revision

**File:** `reconciliation.worker.ts` plus repository methods already added.

- [ ] **Step 1: Add a bounded refund-reconciliation loop after payment reconciliation.**

For each stale automatic pending refund:
1. short tenant TX loads refund and exact source payment;
2. validate refund remains pending/automatic and payment succeeded;
3. resolve gateway via `resolveForPayment(payment)`;
4. close TX;
5. call `gateway.queryRefundStatus({refundId: refund.id})` outside DB transaction;
6. persist result in a new short TX under `lockForBooking()`.

- [ ] **Step 2: Handle results.**

- succeeded -> `completeAutomatic()` + `refund.completed` outbox;
- pending -> no mutation except normal updated telemetry/logging; next poll later;
- failed -> `markAutomaticFailed()` only for a final, non-retryable result;
- retryable transport/config query error -> log sanitized message and keep pending.

Providers whose `queryRefundStatus()` cannot reconcile an automatic refund must not fabricate success. If such a refund should have been manual from the start, the provider's `refund()` must return `unsupported` in Task 1 compatibility implementation.

- [ ] **Step 3: Prevent hot-looping.**

The stale query must use DB `updated_at`/created time and a minimum age. If a pending query result currently does not bump `updated_at`, add a guarded repository `touchAutomaticPending(id)` or equivalent so the same refund is not queried every 30 seconds indefinitely without respecting the configured stale interval.

- [ ] **Step 4: Runtime refund reconciliation smoke with MoMo sandbox.**

At minimum:
- full refund success;
- partial refund success;
- pending response followed by refund-query success if sandbox can produce it;
- duplicate/retry same local refund uses same create orderId/requestId;
- refund query uses a fresh query requestId;
- credential rotation after original payment still resolves original revision;
- ineligible refund maps to manual-required, not fake success;
- failed refund never emits `refund.completed`.

If sandbox cannot force a particular result code, document the unverified branch explicitly.

- [ ] **Step 5: Commit.**

```bash
git add apps/api/src/modules/payments/infrastructure/reconciliation.worker.ts \
  apps/api/src/modules/payments/domain/ports/refund-repository.port.ts \
  apps/api/src/modules/payments/infrastructure/repositories/prisma-refund.repository.ts
git commit -m "feat(payments): reconcile pending momo refunds"
```

---

### Task 8: PR3 completion review

- [ ] **Step 1: Search for forbidden legacy MoMo assumptions.**

```bash
rg "resultCode.*===.*0|resultCode.*!==.*0|queryPaymentStatus" \
  apps/api/src/modules/payments/infrastructure/gateways/momo-gateway.adapter.ts \
  apps/api/src/modules/payments/application/use-cases/execute-automatic-refund.use-case.ts
```

Manually inspect hits. There must be no generic “nonzero => expired/unsupported” and no refund fallback to original payment status.

- [ ] **Step 2: Run full static gate.**

```bash
pnpm check:no-tests && \
pnpm check:module-cycles && \
pnpm check:frontend-structure && \
pnpm check:theme-tokens && \
pnpm check:tenant-surfaces && \
pnpm --filter=@booking/storefront security && \
pnpm turbo lint typecheck build && \
pnpm --filter=@booking/api check:rls
```

- [ ] **Step 3: Inspect diff for scope.**

No RefundBatch/multi-payment allocator, storefront balance UI, card provider, VNPay, or napas cleanup belongs in PR3.

- [ ] **Step 4: Create a draft PR only after static + available sandbox smoke.**

Suggested title:

```text
fix(payments): harden MoMo checkout and refund reconciliation
```

PR description must record:
- exact mutating ID formats;
- why query request IDs are fresh;
- result-code mapping table/source date;
- refund-query behavior;
- sandbox cases actually exercised vs not reproducible;
- credential-rotation observation;
- exact static commands/outcomes.
