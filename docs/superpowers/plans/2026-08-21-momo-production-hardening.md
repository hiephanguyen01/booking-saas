# MoMo Production Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make tenant-owned MoMo checkout/refund production-safe with DB-first initiation, correct idempotency/IPN/query handling, and safe refund recovery while preserving SePay/PayOS/ZaloPay/mock checkout behavior.

**Architecture:** MoMo alone opts into an optional `persist_first` checkout capability. BookingOS commits a pending payment + stable MoMo order reference before the provider create call, keeps IPN as primary truth, uses reconciliation for lost/uncertain payment state, and uses stable per-attempt refund identities plus refund-query before retry/manual fallback.

**Tech Stack:** Node.js >= 22.22.0, TypeScript, NestJS 11, Prisma/PostgreSQL + RLS/advisory locks, BullMQ outbox/reconciliation, React Router 8 dashboard, pnpm 10.13.1, MoMo AIOv2 REST APIs.

**Spec:** `docs/superpowers/specs/2026-08-21-momo-production-hardening-design.md`

## Global Constraints

- **NO TEST FILES**: no `*.spec.*`, `*.test.*`, e2e, Jest/Vitest/Playwright config, test scripts, or CI test steps.
- Verification = static checks + running the app + MoMo sandbox/production UAT.
- Backend remains `controller -> use-case -> repository-port -> repository`; no application services.
- Tenant data remains inside `TenantDbService.forTenant(...)`; never keep an RLS transaction open across provider I/O.
- Cross-module side effects remain outbox events.
- Money remains `bigint` VND.
- MoMo IPN/query, never browser redirect, establishes payment truth.
- Create retries reuse the same MoMo `orderId/requestId`; payment/refund **query** calls use fresh request IDs.
- MoMo create/query/refund use a 30-second timeout.
- Existing SePay/PayOS/ZaloPay/mock checkout lifecycle remains provider-first.
- No schema migration is planned. If a durable field becomes unavoidable, stop and revise the design first.

---

### Task 1: Add lifecycle/result contracts

**Files:**
- Modify: `apps/api/src/modules/payments/domain/ports/payment-gateway.port.ts`
- Modify: `apps/api/src/modules/payments/domain/entities/payment.entity.ts`
- Create: `apps/api/src/modules/payments/infrastructure/gateways/momo-result-code.ts`

**Interfaces:**
- Produces: optional checkout/reconciliation capabilities.
- Produces: `WebhookEvent` with `pending`.
- Produces: refund attempt/pending/retry metadata.
- Produces: pure MoMo payment/refund result helpers.

- [ ] **Step 1: Extend `PaymentGatewayPort` with optional capabilities**

Use these declarations:

```ts
export type CheckoutInitiation = 'provider_first' | 'persist_first';
export type WebhookEvent = 'pending' | 'succeeded' | 'failed' | 'expired' | 'refunded';

export interface RefundInput {
  gatewayTxnId: string;
  gatewayOrderRef: string;
  amountVnd: bigint;
  reason: string;
  attempt?: number;
}

export interface RefundResult {
  supported: boolean;
  refundId?: string;
  pending?: boolean;
  retryAfterSec?: number;
}

export interface PaymentGatewayPort {
  readonly key: GatewayKey;
  readonly checkoutInitiation?: CheckoutInitiation;
  readonly reconcileFailedAsTerminal?: boolean;
  createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult>;
  providerPaymentMethod(method: CustomerPaymentMethod): string;
  peekReference(rawBody: Buffer): string | null;
  verifyWebhook(rawBody: Buffer, headers: Record<string, string>): WebhookVerification;
  refund(input: RefundInput): Promise<RefundResult>;
  queryPaymentStatus(reference: string): Promise<PaymentStatusResult>;
}
```

Omitted capabilities mean current behavior, so existing adapters need no lifecycle change.

- [ ] **Step 2: Ignore pending webhook events in the payment aggregate**

Change the first branch of `Payment.decideWebhookTransition` to:

```ts
if (event === 'refunded' || event === 'pending') return { action: 'ignore' };
```

Keep the existing terminal/succeeded branches unchanged after it.

- [ ] **Step 3: Add `momo-result-code.ts`**

```ts
import type { PaymentStatusResult } from '../../domain/ports/payment-gateway.port';

const FINAL_PAYMENT_FAILURE_CODES = new Set([
  98, 99,
  1001, 1002, 1003, 1004, 1006, 1007, 1017, 1026,
  2019, 4001, 4002, 4100,
]);

export function mapMomoPaymentResultCode(
  code: number | undefined,
): PaymentStatusResult['status'] {
  if (code === 0 || code === 9000) return 'succeeded';
  if (code === 1005) return 'expired';
  if (code === 1000 || code === 7000 || code === 7002 || code === undefined) return 'pending';
  if (FINAL_PAYMENT_FAILURE_CODES.has(code)) return 'failed';
  return 'pending';
}

export const isMomoRefundPending = (code: number | undefined): boolean =>
  code === 1000 || code === 7000 || code === 7002;

export const isMomoRefundRetryableFailure = (code: number | undefined): boolean => code === 1080;

export const isMomoRefundManualFailure = (code: number | undefined): boolean =>
  code === 1081 || code === 1088;
```

- [ ] **Step 4: Verify and commit**

```bash
pnpm check:no-tests
pnpm --filter=@booking/api typecheck
pnpm --filter=@booking/api lint
git add -- apps/api/src/modules/payments/domain/ports/payment-gateway.port.ts apps/api/src/modules/payments/domain/entities/payment.entity.ts apps/api/src/modules/payments/infrastructure/gateways/momo-result-code.ts
git commit -m "refactor(payments): model MoMo lifecycle capabilities"
```

---

### Task 2: Add persist-first payment repository primitives

**Files:**
- Modify: `apps/api/src/modules/payments/domain/ports/payment-repository.port.ts`
- Modify: `apps/api/src/modules/payments/infrastructure/repositories/prisma-payment.repository.ts`

**Interfaces:**
- Produces: `PendingCheckoutRecord`.
- Produces: `lockCheckout(...)` and `saveCheckoutDestination(...)`.

- [ ] **Step 1: Extend the repository port**

```ts
export interface PendingCheckoutRecord {
  id: string;
  gatewayOrderRef: string | null;
  destination: CheckoutDestination | null;
}

lockCheckout(tx: PrismaTx, bookingId: string, paymentMethod: string): Promise<void>;
findPendingCheckout(
  tx: PrismaTx,
  bookingId: string,
  paymentMethod: string,
): Promise<PendingCheckoutRecord | null>;
saveCheckoutDestination(
  tx: PrismaTx,
  paymentId: string,
  destination: CheckoutDestination,
): Promise<void>;
```

- [ ] **Step 2: Implement the checkout advisory lock**

```ts
async lockCheckout(tx: PrismaTx, bookingId: string, paymentMethod: string): Promise<void> {
  await tx.$executeRaw(
    Prisma.sql`SELECT pg_advisory_xact_lock(hashtext('checkout:' || ${bookingId} || ':' || ${paymentMethod}))`,
  );
}
```

This follows the existing `PrismaRefundRepository.lockForBooking` pattern.

- [ ] **Step 3: Return pending rows even without a destination**

Select `id`, `gatewayOrderRef`, and `gatewayPayload`. Keep the current destination parsing logic, but return:

```ts
return {
  id: payment.id,
  gatewayOrderRef: payment.gatewayOrderRef,
  destination: parsed.success ? parsed.data : null,
};
```

Do not return `null` merely because `gatewayPayload.destination` is absent.

- [ ] **Step 4: Persist the provider handoff in a short guarded transaction**

```ts
async saveCheckoutDestination(
  tx: PrismaTx,
  paymentId: string,
  destination: CheckoutDestination,
): Promise<void> {
  await tx.payment.updateMany({
    where: { id: paymentId, status: 'pending' },
    data: { gatewayPayload: { destination } as Prisma.InputJsonObject },
  });
}
```

- [ ] **Step 5: Verify and commit**

```bash
pnpm check:no-tests
pnpm --filter=@booking/api typecheck
pnpm --filter=@booking/api lint
git add -- apps/api/src/modules/payments/domain/ports/payment-repository.port.ts apps/api/src/modules/payments/infrastructure/repositories/prisma-payment.repository.ts
git commit -m "feat(payments): add persist-first checkout repository flow"
```

---

### Task 3: Make `CheckoutUseCase` DB-first only for MoMo

**Files:**
- Modify: `apps/api/src/modules/payments/application/use-cases/checkout.use-case.ts`

**Interfaces:**
- Consumes Task 1 capability + Task 2 repository methods.
- Public output remains `CheckoutResponse`.

- [ ] **Step 1: Preserve provider-first behavior**

Inside the tenant transaction:

```ts
const initiation = gateway.checkoutInitiation ?? 'provider_first';
const existing = await this.payments.findPendingCheckout(tx, bookingId, providerPaymentMethod);

if (initiation === 'provider_first') {
  if (existing?.destination) {
    return {
      kind: 'response' as const,
      response: { paymentId: existing.id, destination: existing.destination },
    };
  }
  // Keep the current gateway.createPayment(...) -> payments.create(...) sequence here.
}
```

Do not move SePay/PayOS/ZaloPay/mock network behavior.

- [ ] **Step 2: Serialize and create/reuse a persist-first row**

For `persist_first`:

```ts
await this.payments.lockCheckout(tx, bookingId, providerPaymentMethod);
const pending = await this.payments.findPendingCheckout(tx, bookingId, providerPaymentMethod);

if (pending?.destination) {
  return {
    kind: 'response' as const,
    response: { paymentId: pending.id, destination: pending.destination },
  };
}

if (pending && !pending.gatewayOrderRef) {
  throw new Error('Pending persist-first payment is missing gatewayOrderRef');
}

const orderRef =
  pending?.gatewayOrderRef ?? `BKF-${randomUUID().replaceAll('-', '').toUpperCase()}`;

const paymentId = pending
  ? pending.id
  : (
      await this.payments.create(tx, tenant.id, {
        bookingId,
        gateway: gateway.key,
        kind,
        amount,
        gatewayOrderRef: orderRef,
        paymentMethod: providerPaymentMethod,
        idempotencyKey: `checkout:${bookingId}:${paymentMethod}:${orderRef}`,
      })
    ).id;
```

Return a private discriminated object containing `gateway`, `tenantId`, `paymentId`, `orderRef`, amount, description, URLs, expiration, and selected payment method.

- [ ] **Step 3: Call MoMo after the first transaction commits**

```ts
if (prepared.kind === 'response') return prepared.response;

const created = await prepared.gateway.createPayment({
  amountVnd: prepared.amount,
  orderCode: prepared.orderRef,
  description: prepared.description,
  returnUrl: prepared.returnUrl,
  errorUrl: prepared.errorUrl,
  cancelUrl: prepared.cancelUrl,
  expiresInSec: prepared.expiresInSec,
  paymentMethod: prepared.paymentMethod,
});

await this.tenantDb.forTenant(prepared.tenantId, (tx) =>
  this.payments.saveCheckoutDestination(tx, prepared.paymentId, created.destination),
);

return { paymentId: prepared.paymentId, destination: created.destination };
```

On timeout/error, propagate the error. Never mint a replacement orderRef; the next checkout request reuses the pending row.

- [ ] **Step 4: Add identifier-only logging for persist-first create failures**

Add `Logger` and log only `tenantId`, `paymentId`, `gateway`, `gatewayOrderRef`, and error message. Do not log credentials/signatures.

- [ ] **Step 5: Verify and commit**

```bash
pnpm check:no-tests
pnpm check:module-cycles
pnpm --filter=@booking/api typecheck
pnpm --filter=@booking/api lint
git add -- apps/api/src/modules/payments/application/use-cases/checkout.use-case.ts
git commit -m "feat(payments): persist MoMo checkout before provider create"
```

---

### Task 4: Harden MoMo create/query/IPN

**Files:**
- Modify: `apps/api/src/modules/payments/infrastructure/gateways/momo-gateway.adapter.ts`

**Interfaces:**
- Produces: `checkoutInitiation = 'persist_first'`.
- Produces: `reconcileFailedAsTerminal = true`.
- Uses Task 1 result helpers.

- [ ] **Step 1: Add capabilities, fresh query IDs, and constant-time signature comparison**

```ts
import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { mapMomoPaymentResultCode } from './momo-result-code';

readonly checkoutInitiation = 'persist_first' as const;
readonly reconcileFailedAsTerminal = true;

function queryRequestId(prefix: 'PQ' | 'RQ'): string {
  return `${prefix}${randomUUID().replaceAll('-', '')}`.slice(0, 50);
}

function sameHex(expected: string, actual: string): boolean {
  if (!/^[0-9a-f]+$/i.test(expected) || !/^[0-9a-f]+$/i.test(actual)) return false;
  const left = Buffer.from(expected, 'hex');
  const right = Buffer.from(actual, 'hex');
  return left.length === right.length && timingSafeEqual(left, right);
}
```

- [ ] **Step 2: Reject an invalid production callback origin**

`ipnUrl()` must parse `PUBLIC_API_URL` and, in production, reject non-HTTPS plus `localhost`, `127.0.0.1`, and `[::1]`. Return `${origin}/webhooks/momo` with trailing slash normalized.

- [ ] **Step 3: Harden create-payment**

Keep `captureWallet`, `autoCapture: true`, and `orderId = requestId = input.orderCode`. Add:

```ts
signal: AbortSignal.timeout(30_000),
```

Check `res.ok`. A non-success/uncertain result throws without changing the stable reference. Sandbox validation in Task 8 decides whether the undocumented `orderExpireTime` field stays.

- [ ] **Step 4: Harden IPN parsing and verification**

Malformed JSON must return an invalid verification object instead of throwing. For parsed input require:

```ts
const signatureValid = sameHex(this.sign(raw), s('signature'));
const partnerValid = s('partnerCode') === this.creds.partnerCode;
const referenceValid = s('orderId').length > 0 && s('requestId') === s('orderId');
const status = mapMomoPaymentResultCode(Number(b.resultCode));
const event: WebhookEvent =
  status === 'succeeded'
    ? 'succeeded'
    : status === 'expired'
      ? 'expired'
      : status === 'failed'
        ? 'failed'
        : 'pending';
```

Return `valid: signatureValid && partnerValid && referenceValid`. Keep amount in `bigint`; the existing use case compares it with the stored payment amount.

- [ ] **Step 5: Fix payment query**

Use `queryRequestId('PQ')`, retain `orderId = reference`, add 30-second timeout, and return:

```ts
return {
  status: mapMomoPaymentResultCode(json.resultCode),
  amountVnd: BigInt(json.amount ?? 0),
  gatewayTxnId: json.transId !== undefined ? String(json.transId) : undefined,
};
```

A query request ID must be fresh each call so status can advance; only the queried `orderId` stays stable.

- [ ] **Step 6: Verify and commit**

```bash
pnpm check:no-tests
pnpm --filter=@booking/api typecheck
pnpm --filter=@booking/api lint
git add -- apps/api/src/modules/payments/infrastructure/gateways/momo-gateway.adapter.ts
git commit -m "fix(payments): harden MoMo create query and IPN"
```

---

### Task 5: Return MoMo 204 and reconcile MoMo final failures

**Files:**
- Modify: `apps/api/src/modules/payments/infrastructure/http/webhook.controller.ts`
- Modify: `apps/api/src/modules/payments/infrastructure/reconciliation.worker.ts`

- [ ] **Step 1: Return HTTP 204/no body for MoMo only**

Inject passthrough Express response:

```ts
@Res({ passthrough: true }) res: Response,
```

After `await this.handle.execute(...)`:

```ts
if (gateway === 'momo') {
  res.status(204);
  return;
}
return gateway === 'zalopay'
  ? { return_code: 1, return_message: 'success' }
  : { success: true };
```

Use return type `Promise<WebhookAcknowledgementResponse | void>` and add Swagger `ApiNoContentResponse`. Preserve existing 200 payloads for other gateways.

- [ ] **Step 2: Let only opted-in gateways terminalize queried `failed`**

Inside reconciliation, after `queryPaymentStatus` and before succeeded handling:

```ts
if (status.status === 'expired') {
  await this.payments.markTerminalIfPending(tx, p.id, 'expired');
  return false;
}
if (status.status === 'failed' && gateway.reconcileFailedAsTerminal === true) {
  await this.payments.markTerminalIfPending(tx, p.id, 'failed');
  return false;
}
if (status.status !== 'succeeded') return false;
```

Only MoMo opts in in this branch; existing gateway reconciliation semantics stay unchanged.

- [ ] **Step 3: Verify and commit**

```bash
pnpm check:no-tests
pnpm check:module-cycles
pnpm --filter=@booking/api typecheck
pnpm --filter=@booking/api lint
git add -- apps/api/src/modules/payments/infrastructure/http/webhook.controller.ts apps/api/src/modules/payments/infrastructure/reconciliation.worker.ts
git commit -m "fix(payments): acknowledge and reconcile MoMo correctly"
```

---

### Task 6: Make MoMo refund uncertainty durable and retry-safe

**Files:**
- Modify: `apps/api/src/shared/outbox/outbox.service.ts`
- Modify: `apps/api/src/modules/payments/application/use-cases/execute-refund.use-case.ts`
- Modify: `apps/api/src/modules/payments/application/use-cases/execute-automatic-refund.use-case.ts`
- Modify: `apps/api/src/modules/payments/infrastructure/http/payments.module.ts`
- Modify: `apps/api/src/modules/payments/infrastructure/gateways/momo-gateway.adapter.ts`

- [ ] **Step 1: Allow an outbox event to be scheduled**

```ts
export interface EmitOptions {
  tenantId?: string;
  eventType: string;
  payload: Prisma.InputJsonValue;
  availableAt?: Date;
}
```

Persist:

```ts
...(options.availableAt ? { availableAt: options.availableAt } : {}),
```

Existing callers remain immediate because the field is optional.

- [ ] **Step 2: Put automatic refund attempt ordinal in the event**

When `ExecuteRefundUseCase` emits `refund.execution_requested`, include `attempt: 0` in that payload. Keep manual `refund.requested` payload behavior unchanged.

In `PaymentsModule`:

```ts
const p = event.payload as { refundId: string; attempt?: number };
return this.automaticRefunds.execute(tenantId, p.refundId, p.attempt ?? 0);
```

- [ ] **Step 3: Teach the automatic refund use case three provider outcomes**

Change signature:

```ts
async execute(tenantId: string, refundId: string, attempt = 0): Promise<void>
```

Pass `attempt` into `gateway.refund(...)`.

If `result.pending === true`, throw so the same outbox event/attempt ordinal is redelivered.

If `result.retryAfterSec !== undefined`, re-open a short tenant transaction, lock the booking refund, confirm it is still automatic/pending, and emit:

```ts
await this.outbox.emit(tx, {
  tenantId,
  eventType: 'refund.execution_requested',
  payload: { refundId, attempt: attempt + 1 },
  availableAt: new Date(Date.now() + result.retryAfterSec * 1_000),
});
```

Then return without marking manual. Keep the current success and final-manual paths after those two branches.

- [ ] **Step 4: Make refund request identity stable per attempt**

```ts
function momoRefundId(idempotencyKey: string, attempt: number): string {
  return `RF${createHash('sha256')
    .update(`${idempotencyKey}:attempt:${attempt}`)
    .digest('hex')
    .slice(0, 32)}`;
}
```

Use `attempt = input.attempt ?? 0` and derive from `${input.gatewayOrderRef}:${input.reason}`. Same attempt ordinal always reuses the same MoMo refund `orderId/requestId`.

- [ ] **Step 5: Query the refund attempt before POSTing another refund**

Add `queryRefundAttempt(orderId)` using:

```ts
const requestId = queryRequestId('RQ');
const raw =
  `accessKey=${accessKey}&orderId=${orderId}&partnerCode=${partnerCode}&requestId=${requestId}`;
```

POST `/v2/gateway/api/refund/query` with a 30-second timeout. Parse `resultCode` plus `refundTrans[]` (`orderId`, `amount`, `resultCode`, `transId`).

Interpret a matching prior attempt as follows:

```ts
if (priorCode === 0 && priorAttempt) {
  return {
    supported: true,
    refundId: priorAttempt.transId !== undefined ? String(priorAttempt.transId) : id,
  };
}
if (isMomoRefundPending(priorCode)) return { supported: true, pending: true, refundId: id };
if (isMomoRefundRetryableFailure(priorCode)) {
  return attempt === 0
    ? { supported: true, retryAfterSec: 3_600, refundId: id }
    : { supported: false };
}
if (isMomoRefundManualFailure(priorCode)) return { supported: false };
```

If query is inconclusive/not-found, POST the same attempt ID; provider idempotency protects a lost response.

- [ ] **Step 6: Interpret the refund POST with the same rules**

Keep the existing 30-second timeout, then:

```ts
if (json.resultCode === 0) {
  return { supported: true, refundId: json.transId !== undefined ? String(json.transId) : id };
}
if (isMomoRefundPending(json.resultCode)) {
  return { supported: true, pending: true, refundId: id };
}
if (isMomoRefundRetryableFailure(json.resultCode)) {
  return attempt === 0
    ? { supported: true, retryAfterSec: 3_600, refundId: id }
    : { supported: false };
}
if (isMomoRefundManualFailure(json.resultCode)) return { supported: false };
throw new Error(`MoMo refund uncertain (${json.resultCode})`);
```

Thus confirmed `1080` gets exactly one new provider attempt after one hour; second `1080`, `1081`, or `1088` goes through the existing manual workflow.

- [ ] **Step 7: Log refund pending/retry decisions without secrets**

Add a `Logger` to `ExecuteAutomaticRefundUseCase` and log `tenantId`, `refundId`, `paymentId`, gateway, orderRef, attempt, and retry delay only.

- [ ] **Step 8: Verify and commit**

```bash
pnpm check:no-tests
pnpm check:module-cycles
pnpm --filter=@booking/api typecheck
pnpm --filter=@booking/api lint
git add -- apps/api/src/shared/outbox/outbox.service.ts apps/api/src/modules/payments/application/use-cases/execute-refund.use-case.ts apps/api/src/modules/payments/application/use-cases/execute-automatic-refund.use-case.ts apps/api/src/modules/payments/infrastructure/http/payments.module.ts apps/api/src/modules/payments/infrastructure/gateways/momo-gateway.adapter.ts
git commit -m "fix(payments): make MoMo refunds retry-safe"
```

---

### Task 7: Update production guidance and verify the branch

**Files:**
- Modify: `apps/dashboard/app/features/tenant/components/settings/momo-gateway-card.tsx`
- Modify: authoritative docs only if current prose conflicts with implemented behavior.

- [ ] **Step 1: Update dashboard MoMo setup notes**

Use copy equivalent to:

```tsx
steps={[
  'Mở MoMo Business → Cấu hình kết nối → IPN URL.',
  <>
    Production yêu cầu API public HTTPS; endpoint IPN là{' '}
    <span className="font-mono">/webhooks/momo</span> trên PUBLIC_API_URL.
  </>,
  'BookingOS xác thực IPN bằng HMAC-SHA256 và trả HTTP 204 No Content sau khi xử lý.',
  'Sandbox và Production dùng hai bộ Partner Code/Access Key/Secret Key riêng.',
]}
```

Keep the existing encrypted-secret footnote.

- [ ] **Step 2: Search authoritative docs for stale MoMo behavior**

```bash
rg -n "MoMo|webhooks/momo|refund/query|captureWallet|resultCode" docs AGENTS.md apps/api tasks
```

Update only exact files whose statements are now false. Do not alter stale task checkboxes merely to make them look complete.

- [ ] **Step 3: Run the full repository static check**

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

Expected: every command exits 0.

- [ ] **Step 4: Commit dashboard/docs changes with exact paths**

First inspect changed paths:

```bash
git diff --name-only -- apps/dashboard/app/features/tenant/components/settings/momo-gateway-card.tsx docs AGENTS.md apps/api tasks
```

Always stage the dashboard file if changed:

```bash
git add -- apps/dashboard/app/features/tenant/components/settings/momo-gateway-card.tsx
```

For each authoritative documentation file actually edited, run a separate exact-path command such as:

```bash
git add -- docs/deployment.md
git add -- docs/architecture.md
```

Run only the exact-path commands corresponding to files shown by `git diff --name-only`; do not stage an entire directory. Then:

```bash
git commit -m "docs(payments): clarify MoMo production operations"
```

If no dashboard/docs file changed, skip this commit.

- [ ] **Step 5: Execute MoMo sandbox UAT**

Using real tenant sandbox credentials and a public HTTPS `PUBLIC_API_URL`, verify:

1. successful checkout redirects and reaches `succeeded` through IPN/query;
2. cancellation/rejection reaches final failure;
3. expiry reaches `expired`;
4. concurrent/double-click checkout reuses one pending payment + one orderRef;
5. create timeout/error leaves that row pending and next request reuses the same orderId/requestId;
6. duplicate/in-flight create (`422`/`7000`) does not create a second payment row;
7. delayed/lost IPN converges through reconciliation;
8. invalid signature/partner/reference/amount does not transition payment;
9. `/webhooks/momo` responds 204 with no body;
10. automatic refund succeeds;
11. uncertain refund reuses/query-checks the same attempt instead of double-refunding;
12. confirmed `1080` schedules attempt 1 one hour later;
13. second `1080`, `1081`, or `1088` enters the existing manual workflow;
14. payment/refund downstream booking + settlement projections converge.

If real sandbox credentials or public callback reachability are unavailable, report runtime UAT as blocked; do not fabricate a pass.

- [ ] **Step 6: Sandbox-validate `orderExpireTime`**

If `captureWallet` accepts the existing field and expiry behavior is correct, retain it. If the current sandbox rejects it incompatibly, remove only that field from the create body and rerun the full static check plus affected sandbox cases.

- [ ] **Step 7: Run one-tenant production pilot only after sandbox passes**

For one tenant with real production credentials:

1. confirm `PUBLIC_API_URL` is public HTTPS;
2. make one small real payment;
3. verify IPN -> payment -> booking -> settlement convergence;
4. make one real refund;
5. verify provider + BookingOS refund convergence;
6. inspect logs for invalid signatures, duplicate payment rows, prolonged pending state, or refund uncertainty before enabling another tenant.

Never place production secrets in source, docs, commits, or copied command output.

- [ ] **Step 8: Final branch review**

```bash
git status --short
git diff --stat main...HEAD
git diff --name-only main...HEAD
```

If verification exposed a MoMo-scope defect, edit only the affected file(s), rerun the full static check, then stage each exact changed path individually and commit:

```bash
git commit -m "fix(payments): address MoMo verification findings"
```

Do not create an empty commit.

---

## Acceptance Checklist

- [ ] MoMo has one stable pending payment/reference before provider create.
- [ ] Concurrent/retried MoMo checkout reuses that row/reference.
- [ ] Other gateways remain provider-first.
- [ ] MoMo create uses stable `orderId/requestId`; payment/refund queries use fresh request IDs.
- [ ] Create/query/refund timeouts are 30 seconds.
- [ ] Production callback origin must be public HTTPS.
- [ ] MoMo IPN verifies HMAC in constant time plus configured partner and request/order identity.
- [ ] Existing amount guard still blocks amount mismatch.
- [ ] Pending IPNs do not terminalize payment.
- [ ] MoMo webhook returns 204/no body.
- [ ] Result mapping handles `0`, `9000`, `1000`, `1005`, `7000`, `7002`, and documented final failures.
- [ ] Lost/uncertain payments converge through reconciliation without changing other gateway reconciliation semantics.
- [ ] Refund uncertainty is queried before retry/manual fallback.
- [ ] Same refund attempt reuses one provider identity.
- [ ] Confirmed `1080` schedules one new attempt after one hour; second final retry failure becomes manual.
- [ ] Tenant secrets remain encrypted and never logged.
- [ ] No migration and no test artifacts are added.
- [ ] Full static verification passes.
- [ ] Sandbox UAT passes when credentials/reachability exist.
- [ ] One-tenant production pilot passes before wider rollout.
