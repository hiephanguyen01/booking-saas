# MoMo Production Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make MoMo checkout/refund operations retry-safe and provider-correct by using stable operation identities, normalized result-code handling, dedicated refund-status reconciliation, bounded provider HTTP, and the payment's historical gateway revision.

**Architecture:** Keep the provider-neutral payment core and extend its refund contract from a boolean capability result to normalized `succeeded | pending | failed | unsupported` outcomes. MoMo owns provider-specific operation IDs, result-code mapping, and `/refund/query`; the existing automatic-refund use case owns durable transitions, while the reconciliation worker only discovers pending automatic refunds and delegates them back to that use case. No new database columns or migrations are required: `Refund.status` and `gatewayRefundId` already hold the durable lifecycle/reference needed for PR3.

**Tech Stack:** NestJS 11, TypeScript 5.9, Prisma/PostgreSQL, Vitest 3, native `fetch` via the existing `providerJson()` helper, HMAC-SHA256, BullMQ.

**Spec:** `docs/superpowers/specs/2026-08-22-payment-core-hardening-design.md`

## Global Constraints

- PR3 is stacked on PR2 head `52e48156a862625ba98a022724f3722eebe71991`; do not rewrite or force-update PR1/PR2.
- No merge or deploy is requested.
- Provider network calls must run outside `TenantDbService.forTenant()` transactions.
- Existing payments/refunds must resolve their adapter through `resolveForPayment()` so credential rotation keeps using the historical gateway config revision.
- MoMo `requestId` is an idempotency key; retries of the same logical operation reuse the same deterministic request identity.
- MoMo provider calls use the existing shared `providerJson()` helper with `timeoutMs: 30_000`.
- Fixed-amount payment settlement remains exact-amount only; PR3 must not weaken PR2's amount-equality policy.
- A pending MoMo refund is reconciled with `POST /v2/gateway/api/refund/query`; never infer refund completion from `queryPaymentStatus()` of the original purchase.
- No Prisma migration in PR3.
- ZaloPay/SePay/payOS/mock receive compile-compatible shared-interface updates only; no new provider feature investment.

---

### Task 1: Normalize gateway refund outcomes and non-terminal webhook events

**Files:**
- Modify: `apps/api/src/modules/payments/domain/ports/payment-gateway.port.ts`
- Modify: `apps/api/src/modules/payments/domain/entities/payment.entity.ts`
- Modify: `apps/api/src/modules/payments/application/use-cases/handle-webhook.use-case.spec.ts`
- Modify: `apps/api/src/modules/payments/infrastructure/gateways/sepay-gateway.adapter.ts`
- Modify: `apps/api/src/modules/payments/infrastructure/gateways/payos-gateway.adapter.ts`
- Modify: `apps/api/src/modules/payments/infrastructure/gateways/zalopay-gateway.adapter.ts`
- Modify: `apps/api/src/modules/payments/infrastructure/gateways/mock-gateway.adapter.ts`

**Interfaces:**
- Produces:

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
  // existing members...
  refund(input: RefundInput): Promise<RefundResult>;
  queryRefundStatus(input: RefundStatusInput): Promise<RefundStatusResult>;
}
```

- [ ] **Step 1: Add a failing webhook test proving `pending` is ignored.**

In `handle-webhook.use-case.spec.ts`, add a case using the existing harness:

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

- [ ] **Step 2: Run the targeted test and verify RED.**

Run:

```bash
pnpm vitest run --project api apps/api/src/modules/payments/application/use-cases/handle-webhook.use-case.spec.ts
```

Expected: TypeScript/test failure because `WebhookEvent` does not yet include `pending` and/or the transition would terminalize it.

- [ ] **Step 3: Extend the gateway contract exactly as shown above and make pending webhook transitions an ignore.**

Change `Payment.decideWebhookTransition()` so both `pending` and `refunded` return `{ action: 'ignore' }`:

```ts
if (event === 'pending' || event === 'refunded') return { action: 'ignore' };
if (event !== 'succeeded') {
  return { action: 'terminal', to: event === 'expired' ? 'expired' : 'failed' };
}
return { action: 'try_succeed' };
```

- [ ] **Step 4: Make non-MoMo adapters compile-compatible without feature expansion.**

Convert legacy boolean refund results mechanically:

```ts
return oldSupported
  ? { status: 'succeeded', refundId: oldRefundId }
  : { status: 'unsupported' };
```

For adapters that never return a pending refund in PR3, implement:

```ts
queryRefundStatus(): Promise<RefundStatusResult> {
  return Promise.resolve({ status: 'unsupported' });
}
```

Do not add provider-specific refund-query work to SePay/payOS/ZaloPay/mock in this PR.

- [ ] **Step 5: Run the targeted webhook test plus API typecheck.**

```bash
pnpm vitest run --project api apps/api/src/modules/payments/application/use-cases/handle-webhook.use-case.spec.ts
pnpm --filter=@booking/api typecheck
```

Expected: both pass after all adapters implement the required interface.

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

### Task 2: Harden MoMo operation identity, result codes, HTTP behavior, and refund query

**Files:**
- Modify: `apps/api/src/modules/payments/infrastructure/gateways/momo-gateway.adapter.ts`
- Create: `apps/api/src/modules/payments/infrastructure/gateways/momo-gateway.adapter.spec.ts`

**Interfaces:**
- Consumes: `RefundInput.refundId`, `RefundStatusInput`, normalized `RefundResult`, and `providerJson()` from Task 1 / PR2.
- Produces: stable MoMo create/refund IDs and a working `queryRefundStatus()`.

- [ ] **Step 1: Write RED tests for stable IDs and bounded create retries.**

Create `momo-gateway.adapter.spec.ts`. Use `vi.stubGlobal('fetch', vi.fn(...))` and capture request bodies. Prove two identical `createPayment()` calls use exactly the same `orderId` and `requestId`, that `requestId.length <= 50`, and that `orderId` matches MoMo's documented regex:

```ts
expect(second.requestId).toBe(first.requestId);
expect(second.orderId).toBe(first.orderId);
expect(first.requestId.length).toBeLessThanOrEqual(50);
expect(first.orderId).toMatch(/^[0-9a-zA-Z]([-_.]*[0-9a-zA-Z]+)*$/);
```

Also assert the fetch request carries an `AbortSignal` by exercising the adapter through `providerJson()` rather than direct unbounded `fetch`.

- [ ] **Step 2: Write RED table tests for payment result classification.**

Cover at least:

```ts
const cases = [
  [0, 'succeeded'],
  [9000, 'succeeded'], // autoCapture=true one-step payment
  [1000, 'pending'],
  [7000, 'pending'],
  [7002, 'pending'],
  [1005, 'expired'],
  [1001, 'failed'],
] as const;
```

For result codes `10`, `43`, `47`, assert `queryPaymentStatus()` rejects with `GatewayOperationError.kind === 'retryable'`. For `11`, `12`, `13`, assert `kind === 'configuration'`.

- [ ] **Step 3: Write RED webhook tests for non-final MoMo result codes.**

Build correctly signed MoMo callback payloads and assert:

```ts
expect(adapter.verifyWebhook(raw1000, {}).event).toBe('pending');
expect(adapter.verifyWebhook(raw7002, {}).event).toBe('pending');
expect(adapter.verifyWebhook(raw1005, {}).event).toBe('expired');
expect(adapter.verifyWebhook(raw0, {}).event).toBe('succeeded');
```

A signed non-final provider/system code must never become `failed` merely because it is non-zero.

- [ ] **Step 4: Write RED refund tests for stable local-refund identity and normalized outcomes.**

Use `refundId: 'refund-1'` twice and verify the MoMo refund `orderId` and `requestId` are identical across retries and are derived from the refund ID, not from `gatewayOrderRef` + reason.

Assert these mappings:

```ts
resultCode 0    -> { status: 'succeeded', ... }
resultCode 7000 -> { status: 'pending', ... }
resultCode 7002 -> { status: 'pending', ... }
resultCode 1088 -> { status: 'failed', ... }
```

Assert result code `1080` throws retryable. For ambiguous `1081` (already refunded vs exceeds refundable amount), assert `refund()` reconciles through `queryRefundStatus()` before returning a terminal result.

- [ ] **Step 5: Write RED tests for `POST /v2/gateway/api/refund/query`.**

Verify the request uses deterministic refund order/query request IDs and the documented signing shape:

```text
accessKey=$accessKey&orderId=$orderId&partnerCode=$partnerCode&requestId=$requestId
```

For a successful query response, locate the matching refund transaction by deterministic refund `orderId` and map its result code. If the query itself succeeds but the matching refund transaction is not yet present, return `{ status: 'pending', refundId: deterministicOrderId }` rather than declaring failure.

- [ ] **Step 6: Run the new adapter spec and verify RED.**

```bash
pnpm vitest run --project api apps/api/src/modules/payments/infrastructure/gateways/momo-gateway.adapter.spec.ts
```

Expected: failures on current unstable/create result semantics and missing refund query method.

- [ ] **Step 7: Implement domain-separated deterministic operation IDs.**

Use one helper with output comfortably below MoMo's 50-character requestId limit:

```ts
function momoId(prefix: 'MO' | 'MC' | 'MQ' | 'RF' | 'RR' | 'RQ', value: string): string {
  return `${prefix}${createHash('sha256').update(`${prefix}:${value}`).digest('hex').slice(0, 32)}`;
}
```

Use:

```ts
prepareOrderReference(paymentId) -> momoId('MO', paymentId)
create requestId                 -> momoId('MC', paymentId)
payment query requestId          -> momoId('MQ', orderId)
refund orderId                   -> momoId('RF', refundId)
refund requestId                 -> momoId('RR', refundId)
refund query requestId           -> momoId('RQ', refundId)
```

- [ ] **Step 8: Implement MoMo result classification with explicit categories.**

Keep provider-specific mapping in this adapter. Use these minimum sets:

```ts
const MOMO_CONFIGURATION_CODES = new Set([11, 12, 13]);
const MOMO_RETRYABLE_CODES = new Set([10, 43, 47, 1080]);
const MOMO_PENDING_CODES = new Set([1000, 7000, 7002]);
```

Rules:
- `0` = success.
- `9000` = payment success for this adapter because checkout uses one-step `autoCapture: true`.
- `1000/7000/7002` = pending.
- `1005` = expired for payment status/webhook.
- `11/12/13` = `GatewayOperationError('configuration', ...)` for outbound calls.
- `10/43/47/1080` = `GatewayOperationError('retryable', ...)` for outbound calls.
- other documented final payment codes = failed.
- `1081` during refund create = immediately query the deterministic refund ID and use the dedicated refund-query result.
- `1088` = failed.

For webhook verification, map retryable/configuration/non-final codes to `pending` rather than terminalizing the local Payment.

- [ ] **Step 9: Move every MoMo outbound call onto `providerJson(..., timeoutMs: 30_000)`.**

Apply to:
- `/v2/gateway/api/create`
- `/v2/gateway/api/query`
- `/v2/gateway/api/refund`
- `/v2/gateway/api/refund/query`

Parsers receive `unknown`, validate required primitive fields, and never include credential fields/raw signed request bodies in thrown messages.

- [ ] **Step 10: Run MoMo adapter tests, webhook tests, and API static gates.**

```bash
pnpm vitest run --project api \
  apps/api/src/modules/payments/infrastructure/gateways/momo-gateway.adapter.spec.ts \
  apps/api/src/modules/payments/application/use-cases/handle-webhook.use-case.spec.ts
pnpm --filter=@booking/api lint
pnpm --filter=@booking/api typecheck
```

Expected: all pass.

- [ ] **Step 11: Commit.**

```bash
git add apps/api/src/modules/payments/infrastructure/gateways/momo-gateway.adapter.ts \
  apps/api/src/modules/payments/infrastructure/gateways/momo-gateway.adapter.spec.ts
git commit -m "refactor(payments): harden MoMo provider operations"
```

---

### Task 3: Persist pending/failed automatic refunds and make execution reconcile dedicated refund state

**Files:**
- Modify: `apps/api/src/modules/payments/domain/ports/refund-repository.port.ts`
- Modify: `apps/api/src/modules/payments/infrastructure/repositories/prisma-refund.repository.ts`
- Modify: `apps/api/src/modules/payments/application/use-cases/execute-automatic-refund.use-case.ts`
- Modify: `apps/api/src/modules/payments/application/use-cases/execute-automatic-refund.use-case.spec.ts`

**Interfaces:**
- Produces:

```ts
export interface PendingAutomaticRefundRef {
  id: string;
  tenantId: string;
}

export interface IRefundRepository {
  // existing methods...
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

- [ ] **Step 1: Rewrite the automatic-refund spec harness to normalized provider results and verify RED.**

Replace `supported?: boolean` with:

```ts
providerResult?: RefundResult;
refundStatusResult?: RefundStatusResult;
```

Add `refundId: REFUND_ID` to the expected `RefundInput`.

Add tests proving:
1. `succeeded` completes + emits `refund.completed`.
2. `pending` keeps DB status pending and persists the returned provider reference.
3. a refund already carrying `gatewayRefundId` calls `queryRefundStatus()` and does **not** call `refund()` again.
4. `failed` marks the automatic refund failed and emits neither `refund.completed` nor `refund.requested`.
5. `unsupported` enters `manual_required` and emits `refund.requested`.
6. the exact historical payment config revision is still resolved before either refund/query call.

- [ ] **Step 2: Run the use-case spec and verify RED.**

```bash
pnpm vitest run --project api apps/api/src/modules/payments/application/use-cases/execute-automatic-refund.use-case.spec.ts
```

Expected: compile/assertion failures because repository/result-state methods do not exist and the use case still queries original payment status.

- [ ] **Step 3: Implement guarded repository writes with no schema change.**

`markAutomaticPending()`:

```ts
await tx.refund.updateMany({
  where: { id, status: 'pending', executionMode: 'automatic' },
  data: { gatewayRefundId },
});
return this.findById(tx, id);
```

`failAutomatic()`:

```ts
await tx.refund.updateMany({
  where: { id, status: 'pending', executionMode: 'automatic' },
  data: { status: 'failed', gatewayRefundId },
});
return this.findById(tx, id);
```

`findPendingAutomatic(limit)` uses the admin pool and returns only stable cross-tenant identifiers:

```ts
const rows = await this.prisma.admin.refund.findMany({
  where: { status: 'pending', executionMode: 'automatic' },
  select: { id: true, tenantId: true },
  orderBy: { updatedAt: 'asc' },
  take: limit,
});
return rows;
```

- [ ] **Step 4: Replace original-payment refund inference in `ExecuteAutomaticRefundUseCase`.**

Provider call outside the transaction becomes:

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

Delete the fallback that calls `queryPaymentStatus(reference)` and infers refund completion from `status === 'refunded'`.

- [ ] **Step 5: Apply normalized results under the existing booking lock + re-read.**

```ts
switch (result.status) {
  case 'succeeded':
    // existing completeAutomatic + refund.completed outbox path
    break;
  case 'pending':
    await this.refunds.markAutomaticPending(tx, refundId, result.refundId ?? null);
    break;
  case 'failed':
    await this.refunds.failAutomatic(tx, refundId, result.refundId ?? null);
    break;
  case 'unsupported':
    // existing requireManual + refund.requested path
    break;
}
```

Do not add a new `refund.failed` event in PR3; no consumer exists for it and PR4 owns batch aggregation.

- [ ] **Step 6: Run targeted tests and API static gates.**

```bash
pnpm vitest run --project api apps/api/src/modules/payments/application/use-cases/execute-automatic-refund.use-case.spec.ts
pnpm --filter=@booking/api lint
pnpm --filter=@booking/api typecheck
```

Expected: all pass.

- [ ] **Step 7: Commit.**

```bash
git add apps/api/src/modules/payments/domain/ports/refund-repository.port.ts \
  apps/api/src/modules/payments/infrastructure/repositories/prisma-refund.repository.ts \
  apps/api/src/modules/payments/application/use-cases/execute-automatic-refund.use-case.ts \
  apps/api/src/modules/payments/application/use-cases/execute-automatic-refund.use-case.spec.ts
git commit -m "refactor(payments): reconcile pending automatic refunds"
```

---

### Task 4: Add pending automatic refunds to the reconciliation sweep

**Files:**
- Modify: `apps/api/src/modules/payments/infrastructure/reconciliation.worker.ts`
- Create: `apps/api/src/modules/payments/infrastructure/reconciliation.worker.spec.ts`

**Interfaces:**
- Consumes: `IRefundRepository.findPendingAutomatic()` and `ExecuteAutomaticRefundUseCase.execute(tenantId, refundId)` from Task 3.
- Produces: periodic reconciliation of pending MoMo refunds without duplicating provider/state-transition logic in the worker.

- [ ] **Step 1: Write a RED worker test for pending automatic refund delegation.**

Instantiate `ReconciliationWorker` without calling `onModuleInit()`. Stub all existing discovery calls to empty arrays except:

```ts
findPendingAutomatic: () => Promise.resolve([{ id: 'refund-1', tenantId: 'tenant-1' }])
```

Pass a fake `ExecuteAutomaticRefundUseCase` whose `execute()` records arguments, call `await worker.sweep()`, and assert:

```ts
expect(executed).toEqual([{ tenantId: 'tenant-1', refundId: 'refund-1' }]);
```

Also assert no `queryPaymentStatus()` call is needed by the worker itself.

- [ ] **Step 2: Run the worker spec and verify RED.**

```bash
pnpm vitest run --project api apps/api/src/modules/payments/infrastructure/reconciliation.worker.spec.ts
```

Expected: constructor/interface failure because the worker does not yet accept/delegate to `ExecuteAutomaticRefundUseCase`.

- [ ] **Step 3: Inject `ExecuteAutomaticRefundUseCase` and delegate pending automatic refunds.**

Add the dependency to the worker constructor and, after stale-payment reconciliation, run:

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

Do not open a transaction around this call; the use case already separates its short DB phases from provider I/O and resolves the payment's historical gateway revision.

- [ ] **Step 4: Run worker + refund + MoMo tests together.**

```bash
pnpm vitest run --project api \
  apps/api/src/modules/payments/infrastructure/reconciliation.worker.spec.ts \
  apps/api/src/modules/payments/application/use-cases/execute-automatic-refund.use-case.spec.ts \
  apps/api/src/modules/payments/infrastructure/gateways/momo-gateway.adapter.spec.ts
```

Expected: all pass.

- [ ] **Step 5: Commit.**

```bash
git add apps/api/src/modules/payments/infrastructure/reconciliation.worker.ts \
  apps/api/src/modules/payments/infrastructure/reconciliation.worker.spec.ts
git commit -m "refactor(payments): reconcile MoMo refund status"
```

---

### Task 5: Full verification, stacked PR3, and current-main validation

**Files:**
- Modify if needed: `docs/payments-momo.md` only if the repository already has this provider runbook; otherwise do not create unrelated docs.
- No production file changes are allowed solely to make CI pass unless a fresh failure proves they are required.

- [ ] **Step 1: Run full local/repository verification on the PR3 head.**

```bash
pnpm test
pnpm --filter=@booking/api lint
pnpm --filter=@booking/api typecheck
pnpm turbo run lint typecheck --filter=@booking/web --filter=@booking/storefront --filter=@booking/admin --filter=@booking/partner
pnpm turbo run build --filter=@booking/web --filter=@booking/storefront --filter=@booking/admin --filter=@booking/partner
```

Expected: zero test failures, zero lint/type errors, successful frontend builds.

- [ ] **Step 2: Re-check stack ancestry before opening PR3.**

Prove `refactor/momo-production-hardening` is ahead-only from `refactor/durable-checkout-payos` and `behind_by = 0`. If PR2 moved, merge/sync the new PR2 head into PR3 without force and rerun Step 1.

- [ ] **Step 3: Open PR3 as Draft stacked on PR2.**

Title:

```text
refactor(payments): harden MoMo payment and refund flows
```

Base:

```text
refactor/durable-checkout-payos
```

Body must state:
- stable MoMo payment/refund request identity;
- result-code classification;
- all MoMo outbound HTTP through bounded `providerJson`;
- dedicated `/refund/query` reconciliation;
- pending/failed/manual/succeeded refund semantics;
- historical config resolution through the source payment;
- no Prisma migration;
- no merge/deploy requested.

- [ ] **Step 4: Open a temporary Draft validation PR from the PR3 head to `main`.**

Mark it clearly `Do not merge`. Its only purpose is to trigger the repository's `pull_request` CI against current main for the complete PR1 + PR2 + PR3 stack.

- [ ] **Step 5: Require a fresh green workflow before declaring PR3 integrated.**

The validation run must finish with all of these successful:

```text
Tests
API lint and typecheck
Frontend lint and typecheck
Frontend production builds
```

If any gate fails, use systematic debugging on the exact fresh-runner failure; do not merge or force-update around it.

- [ ] **Step 6: Update PR3 body with final evidence and keep it Draft.**

Record the final head SHA, validation PR number, workflow run number, and the four green gates. Retain the temporary validation PR as evidence unless the user explicitly asks to close/delete it.
