# MoMo Production Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make MoMo checkout and refund operations retry-safe and provider-correct with stable operation identities, normalized result-code handling, dedicated refund-status reconciliation, bounded provider HTTP, and historical gateway-config resolution.

**Architecture:** Extend the provider-neutral refund contract from a boolean capability result to `succeeded | pending | failed | unsupported`. MoMo owns provider-specific IDs, result-code mapping, and `/refund/query`; `ExecuteAutomaticRefundUseCase` owns durable transitions and historical-config resolution; `ReconciliationWorker` only discovers pending automatic refunds and delegates them back to that use case. Existing `Refund.status` and `gatewayRefundId` are sufficient, so PR3 adds no migration.

**Tech Stack:** NestJS 11, TypeScript 5.9, Prisma/PostgreSQL, Vitest 3, native `fetch` through `providerJson()`, HMAC-SHA256, BullMQ.

**Spec:** `docs/superpowers/specs/2026-08-22-payment-core-hardening-design.md`

## Global Constraints

- Stack on PR2 head `52e48156a862625ba98a022724f3722eebe71991`; do not rewrite or force-update PR1/PR2.
- No merge or deploy.
- No provider network call inside `TenantDbService.forTenant()`.
- Existing payment/refund operations resolve the adapter with `resolveForPayment()` so credential rotation keeps using the payment's historical gateway config revision.
- MoMo `requestId` is the idempotency key; retries of one logical operation reuse the same deterministic request ID.
- Every MoMo outbound call uses `providerJson(..., timeoutMs: 30_000)`.
- Pending MoMo refunds are reconciled only with `POST /v2/gateway/api/refund/query`; never infer refund completion from original-payment status.
- PR2 exact captured-amount semantics remain unchanged.
- No Prisma migration.
- SePay/payOS/ZaloPay/mock receive shared-interface compatibility changes only.

---

### Task 1: Normalize gateway refund outcomes and pending webhook semantics

**Files:**
- Modify: `apps/api/src/modules/payments/domain/ports/payment-gateway.port.ts`
- Modify: `apps/api/src/modules/payments/domain/entities/payment.entity.ts`
- Modify: `apps/api/src/modules/payments/application/use-cases/handle-webhook.use-case.spec.ts`
- Modify: `apps/api/src/modules/payments/infrastructure/gateways/{sepay,payos,zalopay,mock}-gateway.adapter.ts`

**Produces:**

```ts
export type WebhookEvent = 'pending' | 'succeeded' | 'failed' | 'expired' | 'refunded';

export interface RefundInput {
  refundId: string;
  gatewayTxnId: string;
  gatewayOrderRef: string;
  amountVnd: bigint;
  reason: string;
}

export type RefundProviderStatus = 'succeeded' | 'pending' | 'failed' | 'unsupported';

export interface RefundResult {
  status: RefundProviderStatus;
  refundId?: string;
}

export interface RefundStatusInput {
  refundId: string;
  gatewayRefundId: string | null;
}

export type RefundStatusResult = RefundResult;

export interface PaymentGatewayPort {
  // existing members
  refund(input: RefundInput): Promise<RefundResult>;
  queryRefundStatus(input: RefundStatusInput): Promise<RefundStatusResult>;
}
```

- [ ] **Step 1: Add a RED webhook test for pending events.**

```ts
it('ignores a non-final pending provider notification', async () => {
  const { useCase, calls, events } = harness({
    verification: verification({ event: 'pending' }),
  });

  await useCase.execute('sepay', RAW, HEADERS);

  expect(calls).toEqual(['find']);
  expect(events).toEqual([]);
});
```

- [ ] **Step 2: Run the test and confirm RED.**

```bash
pnpm vitest run --project api apps/api/src/modules/payments/application/use-cases/handle-webhook.use-case.spec.ts
```

Expected: the new case fails because current non-success events are terminalized.

- [ ] **Step 3: Implement the shared interfaces above and ignore pending/refunded callbacks.**

```ts
if (event === 'pending' || event === 'refunded') return { action: 'ignore' };
if (event !== 'succeeded') {
  return { action: 'terminal', to: event === 'expired' ? 'expired' : 'failed' };
}
return { action: 'try_succeed' };
```

- [ ] **Step 4: Convert non-MoMo adapter refund results mechanically.**

Old success/capability behavior becomes:

```ts
return oldSupported
  ? { status: 'succeeded', refundId: oldRefundId }
  : { status: 'unsupported' };
```

Because these adapters do not produce a pending refund in PR3, add only compile-compatible status query methods:

```ts
queryRefundStatus(): Promise<RefundStatusResult> {
  return Promise.resolve({ status: 'unsupported' });
}
```

- [ ] **Step 5: Verify GREEN + static compatibility.**

```bash
pnpm vitest run --project api apps/api/src/modules/payments/application/use-cases/handle-webhook.use-case.spec.ts
pnpm --filter=@booking/api typecheck
```

- [ ] **Step 6: Commit.**

```bash
git add apps/api/src/modules/payments/domain/ports/payment-gateway.port.ts \
  apps/api/src/modules/payments/domain/entities/payment.entity.ts \
  apps/api/src/modules/payments/application/use-cases/handle-webhook.use-case.spec.ts \
  apps/api/src/modules/payments/infrastructure/gateways/sepay-gateway.adapter.ts \
  apps/api/src/modules/payments/infrastructure/gateways/payos-gateway.adapter.ts \
  apps/api/src/modules/payments/infrastructure/gateways/zalopay-gateway.adapter.ts \
  apps/api/src/modules/payments/infrastructure/gateways/mock-gateway.adapter.ts
git commit -m "refactor(payments): normalize refund provider outcomes"
```

---

### Task 2: Harden MoMo IDs, result codes, provider HTTP, and refund query

**Files:**
- Modify: `apps/api/src/modules/payments/infrastructure/gateways/momo-gateway.adapter.ts`
- Create: `apps/api/src/modules/payments/infrastructure/gateways/momo-gateway.adapter.spec.ts`

**Consumes:** Task 1 gateway interfaces and PR2 `providerJson()`.

- [ ] **Step 1: Write RED tests for stable create identity.**

Mock `fetch`, call `createPayment()` twice with the same `paymentId`, capture both JSON bodies, and assert:

```ts
expect(second.orderId).toBe(first.orderId);
expect(second.requestId).toBe(first.requestId);
expect(first.requestId.length).toBeLessThanOrEqual(50);
expect(first.orderId).toMatch(/^[0-9a-zA-Z]([-_.]*[0-9a-zA-Z]+)*$/);
```

Also mock a rejected fetch and assert the adapter surfaces `GatewayOperationError.kind === 'retryable'`; this proves create uses the bounded provider helper rather than raw unbounded `fetch`.

- [ ] **Step 2: Write RED payment-status classification tests.**

```ts
const cases = [
  [0, 'succeeded'],
  [9000, 'succeeded'], // one-step autoCapture=true
  [1000, 'pending'],
  [7000, 'pending'],
  [7002, 'pending'],
  [1005, 'expired'],
  [1001, 'failed'],
] as const;
```

Assert outbound result codes `10`, `43`, `47` throw retryable and `11`, `12`, `13` throw configuration errors.

- [ ] **Step 3: Write RED signed-webhook classification tests.**

Create correctly signed callback bodies and assert:

```ts
expect(adapter.verifyWebhook(raw1000, {}).event).toBe('pending');
expect(adapter.verifyWebhook(raw7002, {}).event).toBe('pending');
expect(adapter.verifyWebhook(raw1005, {}).event).toBe('expired');
expect(adapter.verifyWebhook(raw0, {}).event).toBe('succeeded');
```

- [ ] **Step 4: Write RED refund identity/result tests.**

Call `refund()` twice with `refundId: 'refund-1'`; prove the same refund `orderId` and `requestId` are reused and do not depend on `gatewayOrderRef + reason`.

Required mappings:

```text
0    -> succeeded
7000 -> pending
7002 -> pending
1088 -> failed
1080 -> throw retryable
1081 -> reconcile through queryRefundStatus before returning terminal state
```

- [ ] **Step 5: Write RED `/refund/query` tests.**

Verify `POST /v2/gateway/api/refund/query`, the signature source:

```text
accessKey=$accessKey&orderId=$orderId&partnerCode=$partnerCode&requestId=$requestId
```

and matching of the deterministic refund `orderId` inside `refundTrans`. If the query succeeds but that refund is not present yet, return pending with the deterministic refund order ID.

- [ ] **Step 6: Run the new spec and confirm RED.**

```bash
pnpm vitest run --project api apps/api/src/modules/payments/infrastructure/gateways/momo-gateway.adapter.spec.ts
```

- [ ] **Step 7: Implement deterministic domain-separated IDs.**

```ts
function momoId(prefix: 'MO' | 'MC' | 'MQ' | 'RF' | 'RR' | 'RQ', value: string): string {
  return `${prefix}${createHash('sha256').update(`${prefix}:${value}`).digest('hex').slice(0, 32)}`;
}
```

Use:

```text
payment orderId       = MO(paymentId)
create requestId      = MC(paymentId)
payment query request = MQ(orderId)
refund orderId        = RF(refundId)
refund requestId      = RR(refundId)
refund query request  = RQ(refundId)
```

`prepareOrderReference(paymentId)` returns the deterministic `MO` order ID, so it is persisted before provider I/O.

- [ ] **Step 8: Implement explicit result-code classes.**

```ts
const MOMO_CONFIGURATION_CODES = new Set([11, 12, 13]);
const MOMO_RETRYABLE_CODES = new Set([10, 43, 47, 1080]);
const MOMO_PENDING_CODES = new Set([1000, 7000, 7002]);
```

Rules:
- `0`: success.
- `9000`: payment success because this adapter uses one-step `autoCapture: true`.
- `1000/7000/7002`: pending.
- `1005`: expired for payment status/webhook.
- `11/12/13`: configuration error on outbound requests.
- `10/43/47/1080`: retryable error on outbound requests.
- other final payment codes: failed.
- `1081` on refund create: immediately call the dedicated refund query using the deterministic refund ID.
- `1088`: failed.
- for a signed callback, retryable/configuration/non-final codes map to `pending`, never to local financial failure solely because they are non-zero.

- [ ] **Step 9: Move all MoMo outbound calls to `providerJson(..., timeoutMs: 30_000)`.**

Apply to:

```text
/v2/gateway/api/create
/v2/gateway/api/query
/v2/gateway/api/refund
/v2/gateway/api/refund/query
```

Each parser narrows `unknown` and thrown messages must not include credentials, signatures, or raw bodies.

- [ ] **Step 10: Verify GREEN.**

```bash
pnpm vitest run --project api \
  apps/api/src/modules/payments/infrastructure/gateways/momo-gateway.adapter.spec.ts \
  apps/api/src/modules/payments/application/use-cases/handle-webhook.use-case.spec.ts
pnpm --filter=@booking/api lint
pnpm --filter=@booking/api typecheck
```

- [ ] **Step 11: Commit.**

```bash
git add apps/api/src/modules/payments/infrastructure/gateways/momo-gateway.adapter.ts \
  apps/api/src/modules/payments/infrastructure/gateways/momo-gateway.adapter.spec.ts
git commit -m "refactor(payments): harden MoMo provider operations"
```

---

### Task 3: Persist pending/failed automatic refunds and reconcile the refund itself

**Files:**
- Modify: `apps/api/src/modules/payments/domain/ports/refund-repository.port.ts`
- Modify: `apps/api/src/modules/payments/infrastructure/repositories/prisma-refund.repository.ts`
- Modify: `apps/api/src/modules/payments/application/use-cases/execute-automatic-refund.use-case.ts`
- Modify: `apps/api/src/modules/payments/application/use-cases/execute-automatic-refund.use-case.spec.ts`

**Produces:**

```ts
export interface PendingAutomaticRefundRef {
  id: string;
  tenantId: string;
}

export interface IRefundRepository {
  // existing members
  markAutomaticPending(
    tx: PrismaTx,
    id: string,
    gatewayRefundId: string | null,
  ): Promise<RefundRecord | null>;
  failAutomatic(
    tx: PrismaTx,
    id: string,
    gatewayRefundId: string | null,
  ): Promise<RefundRecord | null>;
  findPendingAutomatic(limit: number): Promise<PendingAutomaticRefundRef[]>;
}
```

- [ ] **Step 1: Convert the use-case harness to normalized results and add RED cases.**

Replace the old `supported` option with:

```ts
providerResult?: RefundResult;
refundStatusResult?: RefundStatusResult;
```

Add tests proving:
- every provider refund call receives `refundId: REFUND_ID`;
- succeeded -> `completeAutomatic` + `refund.completed`;
- pending -> remain pending and persist provider ref;
- an already-pending row with `gatewayRefundId` calls `queryRefundStatus()` and does not call `refund()` again;
- failed -> mark failed, no completed/requested event;
- unsupported -> `manual_required` + `refund.requested`;
- source payment still resolves `config-1` through `resolveForPayment()`.

- [ ] **Step 2: Run the use-case spec and confirm RED.**

```bash
pnpm vitest run --project api apps/api/src/modules/payments/application/use-cases/execute-automatic-refund.use-case.spec.ts
```

- [ ] **Step 3: Implement guarded repository writes with existing columns only.**

```ts
async markAutomaticPending(tx, id, gatewayRefundId) {
  await tx.refund.updateMany({
    where: { id, status: 'pending', executionMode: 'automatic' },
    data: { gatewayRefundId },
  });
  return this.findById(tx, id);
}

async failAutomatic(tx, id, gatewayRefundId) {
  await tx.refund.updateMany({
    where: { id, status: 'pending', executionMode: 'automatic' },
    data: { status: 'failed', gatewayRefundId },
  });
  return this.findById(tx, id);
}

async findPendingAutomatic(limit) {
  return this.prisma.admin.refund.findMany({
    where: { status: 'pending', executionMode: 'automatic' },
    select: { id: true, tenantId: true },
    orderBy: { updatedAt: 'asc' },
    take: limit,
  });
}
```

- [ ] **Step 4: Replace original-payment refund inference.**

Outside both DB transactions:

```ts
const result = prepared.refund.gatewayRefundId
  ? await prepared.gateway.queryRefundStatus({
      refundId: prepared.refund.id,
      gatewayRefundId: prepared.refund.gatewayRefundId,
    })
  : await prepared.gateway.refund({
      refundId: prepared.refund.id,
      gatewayTxnId: prepared.payment.gatewayTxnId ?? reference,
      gatewayOrderRef: reference,
      amountVnd: prepared.refund.amount,
      reason: prepared.refund.reason ?? 'booking_cancellation',
    });
```

Delete the old `queryPaymentStatus(reference) === 'refunded'` fallback entirely.

- [ ] **Step 5: Apply normalized transitions under the existing booking lock + re-read.**

```ts
switch (result.status) {
  case 'succeeded':
    // existing completeAutomatic + refund.completed path
    break;
  case 'pending': {
    const providerRef = result.refundId ?? current.gatewayRefundId ?? prepared.refund.gatewayRefundId;
    await this.refunds.markAutomaticPending(tx, refundId, providerRef ?? null);
    break;
  }
  case 'failed': {
    const providerRef = result.refundId ?? current.gatewayRefundId ?? prepared.refund.gatewayRefundId;
    await this.refunds.failAutomatic(tx, refundId, providerRef ?? null);
    break;
  }
  case 'unsupported':
    // existing requireManual + refund.requested path
    break;
}
```

Do not add a `refund.failed` event in PR3; no current consumer exists and PR4 owns batch aggregation.

- [ ] **Step 6: Verify GREEN.**

```bash
pnpm vitest run --project api apps/api/src/modules/payments/application/use-cases/execute-automatic-refund.use-case.spec.ts
pnpm --filter=@booking/api lint
pnpm --filter=@booking/api typecheck
```

- [ ] **Step 7: Commit.**

```bash
git add apps/api/src/modules/payments/domain/ports/refund-repository.port.ts \
  apps/api/src/modules/payments/infrastructure/repositories/prisma-refund.repository.ts \
  apps/api/src/modules/payments/application/use-cases/execute-automatic-refund.use-case.ts \
  apps/api/src/modules/payments/application/use-cases/execute-automatic-refund.use-case.spec.ts
git commit -m "refactor(payments): reconcile pending automatic refunds"
```

---

### Task 4: Reconcile pending automatic refunds from the worker

**Files:**
- Modify: `apps/api/src/modules/payments/infrastructure/reconciliation.worker.ts`
- Create: `apps/api/src/modules/payments/infrastructure/reconciliation.worker.spec.ts`

**Consumes:** `findPendingAutomatic()` and `ExecuteAutomaticRefundUseCase.execute(tenantId, refundId)` from Task 3.

- [ ] **Step 1: Write a RED delegation test.**

Instantiate the worker without calling `onModuleInit()`. Make all existing discovery methods return empty arrays except:

```ts
findPendingAutomatic: () => Promise.resolve([{ id: 'refund-1', tenantId: 'tenant-1' }])
```

Inject a fake automatic-refund executor and assert after `sweep()`:

```ts
expect(executed).toEqual([{ tenantId: 'tenant-1', refundId: 'refund-1' }]);
```

Also assert the worker itself does not call `queryPaymentStatus()` for this refund.

- [ ] **Step 2: Run the worker spec and confirm RED.**

```bash
pnpm vitest run --project api apps/api/src/modules/payments/infrastructure/reconciliation.worker.spec.ts
```

- [ ] **Step 3: Inject and delegate to `ExecuteAutomaticRefundUseCase`.**

After stale-payment reconciliation, add:

```ts
const pendingRefunds = await this.refunds.findPendingAutomatic(100);
for (const refund of pendingRefunds) {
  try {
    await this.executeAutomaticRefund.execute(refund.tenantId, refund.id);
  } catch (err) {
    this.logger.debug(
      `refund reconcile ${refund.id} failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
```

Do not wrap this loop in a tenant transaction; the use case already keeps provider I/O between its short DB phases. `ExecuteAutomaticRefundUseCase` is already registered in `PaymentsModule`, so no module-provider change is required.

- [ ] **Step 4: Run the three PR3 test groups together.**

```bash
pnpm vitest run --project api \
  apps/api/src/modules/payments/infrastructure/reconciliation.worker.spec.ts \
  apps/api/src/modules/payments/application/use-cases/execute-automatic-refund.use-case.spec.ts \
  apps/api/src/modules/payments/infrastructure/gateways/momo-gateway.adapter.spec.ts
```

- [ ] **Step 5: Commit.**

```bash
git add apps/api/src/modules/payments/infrastructure/reconciliation.worker.ts \
  apps/api/src/modules/payments/infrastructure/reconciliation.worker.spec.ts
git commit -m "refactor(payments): reconcile MoMo refund status"
```

---

### Task 5: Full verification and stacked PR validation

**Files:** No additional files. Any fresh failure must be root-caused before changing code.

- [ ] **Step 1: Run the full repository gates on the PR3 head.**

```bash
pnpm test
pnpm --filter=@booking/api lint
pnpm --filter=@booking/api typecheck
pnpm turbo run lint typecheck --filter=@booking/web --filter=@booking/storefront --filter=@booking/admin --filter=@booking/partner
pnpm turbo run build --filter=@booking/web --filter=@booking/storefront --filter=@booking/admin --filter=@booking/partner
```

Expected: zero failures.

- [ ] **Step 2: Re-prove stack ancestry.**

Compare `refactor/durable-checkout-payos` -> `refactor/momo-production-hardening`; require `status=ahead` and `behind_by=0`. If PR2 moved, sync it into PR3 without force and rerun Step 1 before continuing.

- [ ] **Step 3: Open PR3 as Draft stacked on PR2.**

Title:

```text
refactor(payments): harden MoMo payment and refund flows
```

Base: `refactor/durable-checkout-payos`.

Body records:
- stable payment/refund operation IDs;
- result-code categories;
- bounded MoMo provider HTTP;
- dedicated `/refund/query` reconciliation;
- pending/succeeded/failed/manual refund semantics;
- historical config resolution;
- no migration;
- no merge/deploy requested.

- [ ] **Step 4: Open a temporary Draft validation PR from PR3 to `main`.**

Mark it **Do not merge**. Its purpose is only to trigger current-main `pull_request` CI for the complete PR1 + PR2 + PR3 stack.

- [ ] **Step 5: Require a fresh green workflow.**

All four must be successful:

```text
Tests
API lint and typecheck
Frontend lint and typecheck
Frontend production builds
```

On failure, use systematic debugging on the exact fresh-runner evidence; do not bypass with force updates or merge.

- [ ] **Step 6: Update PR3 body with the final head SHA, validation PR number, workflow run number, and four green gates; keep PR3 Draft.**
