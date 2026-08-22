# MoMo Production Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make tenant-owned MoMo checkout/refund production-safe with DB-first initiation, correct idempotency/IPN/query handling, and safe refund recovery while preserving SePay/PayOS/ZaloPay/mock checkout behavior.

**Architecture:** MoMo alone opts into an optional `persist_first` checkout capability. BookingOS commits a pending payment + stable MoMo order reference before provider create, keeps IPN as primary truth, uses reconciliation for lost/uncertain payment state, and uses stable per-attempt refund identities plus refund-query before retry/manual fallback.

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

### Task 1: Add lifecycle and result contracts

**Files:**
- Modify: `apps/api/src/modules/payments/domain/ports/payment-gateway.port.ts`
- Modify: `apps/api/src/modules/payments/domain/entities/payment.entity.ts`
- Create: `apps/api/src/modules/payments/infrastructure/gateways/momo-result-code.ts`

**Interfaces:**
- Produces: optional `checkoutInitiation` and `reconcileFailedAsTerminal` capabilities.
- Produces: `WebhookEvent` with `pending`.
- Produces: refund attempt/pending/retry metadata.
- Produces: pure MoMo result-code helpers.

- [ ] **Step 1: Extend the gateway port**

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

Omitted capabilities preserve current gateway behavior.

- [ ] **Step 2: Ignore pending webhook events**

In `Payment.decideWebhookTransition`:

```ts
if (event === 'refunded' || event === 'pending') return { action: 'ignore' };
```

Keep the existing terminal/succeeded branches after it.

- [ ] **Step 3: Add the MoMo result mapper**

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

### Task 2: Add persist-first repository primitives

**Files:**
- Modify: `apps/api/src/modules/payments/domain/ports/payment-repository.port.ts`
- Modify: `apps/api/src/modules/payments/infrastructure/repositories/prisma-payment.repository.ts`

**Interfaces:**
- Produces: `PendingCheckoutRecord`, `lockCheckout`, `saveCheckoutDestination`.

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

- [ ] **Step 2: Implement advisory locking**

```ts
async lockCheckout(tx: PrismaTx, bookingId: string, paymentMethod: string): Promise<void> {
  await tx.$executeRaw(
    Prisma.sql`SELECT pg_advisory_xact_lock(hashtext('checkout:' || ${bookingId} || ':' || ${paymentMethod}))`,
  );
}
```

- [ ] **Step 3: Return a pending row even without destination**

Keep the existing destination parser but return:

```ts
return {
  id: payment.id,
  gatewayOrderRef: payment.gatewayOrderRef,
  destination: parsed.success ? parsed.data : null,
};
```

- [ ] **Step 4: Add guarded destination persistence**

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

### Task 3: Make checkout DB-first only for MoMo

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
  // Keep the current gateway.createPayment(...) -> payments.create(...) sequence.
}
```

- [ ] **Step 2: Serialize and create/reuse the persist-first row**

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

Return a private discriminated object containing gateway, tenant/payment IDs, orderRef, amount, description, return/error/cancel URLs, expiration, and customer method.

- [ ] **Step 3: Call the persist-first provider outside the transaction**

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

On timeout/error, propagate the error and keep the existing row/reference for retry.

- [ ] **Step 4: Add safe logging**

Add a Nest `Logger`; on persist-first create failure log only tenantId, paymentId, gateway, orderRef, and error message. Never log credentials/signatures.

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

### Task 4: Harden MoMo create, query, and IPN

**Files:**
- Modify: `apps/api/src/modules/payments/infrastructure/gateways/momo-gateway.adapter.ts`

- [ ] **Step 1: Add MoMo capabilities and crypto/request helpers**

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

- [ ] **Step 2: Validate production `PUBLIC_API_URL`**

Parse it with `new URL(...)`. In production reject non-HTTPS and hostnames `localhost`, `127.0.0.1`, `[::1]`; return the normalized `${origin}/webhooks/momo`.

- [ ] **Step 3: Harden create-payment**

Keep `captureWallet`, `autoCapture: true`, and `orderId = requestId = input.orderCode`. Add `AbortSignal.timeout(30_000)` and check `res.ok`. Any non-success/uncertain response throws without minting a new reference. Runtime validation in Task 7 decides whether `orderExpireTime` remains.

- [ ] **Step 4: Harden IPN verification**

Malformed JSON returns an invalid `WebhookVerification` rather than throwing. For parsed input:

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

Return `valid: signatureValid && partnerValid && referenceValid`; preserve amount as `bigint` for the existing application amount guard.

- [ ] **Step 5: Fix payment query**

Use a fresh `queryRequestId('PQ')` on each call, keep `orderId = reference`, add a 30-second timeout, and return:

```ts
return {
  status: mapMomoPaymentResultCode(json.resultCode),
  amountVnd: BigInt(json.amount ?? 0),
  gatewayTxnId: json.transId !== undefined ? String(json.transId) : undefined,
};
```

- [ ] **Step 6: Verify and commit**

```bash
pnpm check:no-tests
pnpm --filter=@booking/api typecheck
pnpm --filter=@booking/api lint
git add -- apps/api/src/modules/payments/infrastructure/gateways/momo-gateway.adapter.ts
git commit -m "fix(payments): harden MoMo create query and IPN"
```

---

### Task 5: Return MoMo 204 and reconcile final MoMo failures

**Files:**
- Modify: `apps/api/src/modules/payments/infrastructure/http/webhook.controller.ts`
- Modify: `apps/api/src/modules/payments/infrastructure/reconciliation.worker.ts`

- [ ] **Step 1: Return HTTP 204/no body for MoMo only**

Inject passthrough Express response:

```ts
@Res({ passthrough: true }) res: Response,
```

After webhook handling:

```ts
if (gateway === 'momo') {
  res.status(204);
  return;
}
return gateway === 'zalopay'
  ? { return_code: 1, return_message: 'success' }
  : { success: true };
```

Use `Promise<WebhookAcknowledgementResponse | void>` and add Swagger `ApiNoContentResponse`. Preserve other gateway payloads.

- [ ] **Step 2: Terminalize queried failure only for opted-in gateways**

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

Only MoMo opts in in this change.

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

- [ ] **Step 1: Allow delayed outbox delivery**

```ts
export interface EmitOptions {
  tenantId?: string;
  eventType: string;
  payload: Prisma.InputJsonValue;
  availableAt?: Date;
}
```

In create data include:

```ts
...(options.availableAt ? { availableAt: options.availableAt } : {}),
```

- [ ] **Step 2: Carry a durable refund attempt ordinal**

For automatic `refund.execution_requested`, include `attempt: 0` in `ExecuteRefundUseCase` payload.

In `PaymentsModule`:

```ts
const p = event.payload as { refundId: string; attempt?: number };
return this.automaticRefunds.execute(tenantId, p.refundId, p.attempt ?? 0);
```

- [ ] **Step 3: Handle pending and scheduled-retry results**

Change signature:

```ts
async execute(tenantId: string, refundId: string, attempt = 0): Promise<void>
```

Pass `attempt` to `gateway.refund(...)`.

For a provider-pending result, throw so the same outbox event/ordinal retries:

```ts
if (result.pending) {
  throw new Error(`Gateway refund attempt ${attempt} is still pending`);
}
```

For a confirmed retryable failure, schedule a new attempt identity:

```ts
if (result.retryAfterSec !== undefined) {
  await this.tenantDb.forTenant(tenantId, async (tx) => {
    await this.refunds.lockForBooking(tx, prepared.refund.bookingId);
    const current = await this.refunds.findById(tx, refundId);
    if (!current || !Refund.rehydrate(current).canExecuteAutomatically()) return;
    await this.outbox.emit(tx, {
      tenantId,
      eventType: 'refund.execution_requested',
      payload: { refundId, attempt: attempt + 1 },
      availableAt: new Date(Date.now() + result.retryAfterSec * 1_000),
    });
  });
  return;
}
```

Keep current success/manual branches after these checks.

- [ ] **Step 4: Make MoMo refund identity stable per attempt**

```ts
function momoRefundId(idempotencyKey: string, attempt: number): string {
  return `RF${createHash('sha256')
    .update(`${idempotencyKey}:attempt:${attempt}`)
    .digest('hex')
    .slice(0, 32)}`;
}
```

Use `attempt = input.attempt ?? 0` and `${input.gatewayOrderRef}:${input.reason}`.

- [ ] **Step 5: Query the refund attempt before another POST**

Add `queryRefundAttempt(orderId)` using fresh `queryRequestId('RQ')`, documented signature:

```ts
const raw =
  `accessKey=${accessKey}&orderId=${orderId}&partnerCode=${partnerCode}&requestId=${requestId}`;
```

POST `/v2/gateway/api/refund/query` with 30-second timeout and parse `resultCode` plus `refundTrans[]`.

For the matching attempt:

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

If query is inconclusive/not-found, POST the same attempt ID; idempotency protects a lost response.

- [ ] **Step 6: Interpret refund POST with the same finality rules**

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

Confirmed `1080` gets one new attempt after one hour. Second `1080`, `1081`, or `1088` enters the existing manual workflow.

- [ ] **Step 7: Add identifier-only refund logging**

Use Nest `Logger` in `ExecuteAutomaticRefundUseCase`; log tenantId, refundId, paymentId, gateway, orderRef, attempt, and retry delay only.

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

### Task 7: Update guidance, run full verification, and execute rollout UAT

**Files:**
- Modify: `apps/dashboard/app/features/tenant/components/settings/momo-gateway-card.tsx`
- Modify: authoritative docs only when current prose conflicts with implemented behavior.

- [ ] **Step 1: Update tenant MoMo setup notes**

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

Keep the encrypted-secret footnote.

- [ ] **Step 2: Check docs for stale MoMo statements**

```bash
rg -n "MoMo|webhooks/momo|refund/query|captureWallet|resultCode" docs AGENTS.md apps/api tasks
```

Edit only authoritative statements made false by this implementation.

- [ ] **Step 3: Run the full repository static verification**

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

- [ ] **Step 4: Commit dashboard/docs changes with exact paths only**

Inspect:

```bash
git diff --name-only -- apps/dashboard/app/features/tenant/components/settings/momo-gateway-card.tsx docs AGENTS.md apps/api tasks
```

Stage the dashboard file if changed:

```bash
git add -- apps/dashboard/app/features/tenant/components/settings/momo-gateway-card.tsx
```

For each authoritative documentation file actually edited, run a separate exact-path `git add -- path/to/file.md`. Then:

```bash
git commit -m "docs(payments): clarify MoMo production operations"
```

If no dashboard/docs file changed, skip this commit.

- [ ] **Step 5: Execute sandbox UAT with real credentials/public HTTPS callback**

Verify all of these cases:

1. successful checkout reaches `succeeded` via IPN/query;
2. cancellation/rejection becomes final failure;
3. expiry becomes `expired`;
4. concurrent/double-click checkout reuses one pending row/reference;
5. create timeout/error reuses the same orderId/requestId on retry;
6. duplicate/in-flight create (`422`/`7000`) creates no second payment row;
7. delayed/lost IPN converges through reconciliation;
8. invalid signature/partner/reference/amount does not transition payment;
9. `/webhooks/momo` responds 204/no body;
10. automatic refund succeeds;
11. uncertain refund is queried/retried with the same attempt identity;
12. confirmed `1080` schedules attempt 1 one hour later;
13. second `1080`, `1081`, or `1088` enters manual-required;
14. booking/settlement projections converge after payment/refund.

If credentials or callback reachability are unavailable, report runtime UAT as blocked; do not fabricate a pass.

- [ ] **Step 6: Validate `orderExpireTime` in sandbox**

If current `captureWallet` accepts it and expiry works, retain it. If sandbox rejects it incompatibly, remove only `orderExpireTime` from the create body, then rerun the full static check and affected sandbox cases.

- [ ] **Step 7: Pilot one production tenant only after sandbox passes**

Confirm public HTTPS callback, run one small real payment and one real refund, verify provider -> payment/refund -> booking -> settlement convergence, and inspect logs before enabling any additional tenant. Never commit or print production secrets.

- [ ] **Step 8: Final branch review**

```bash
git status --short
git diff --stat main...HEAD
git diff --name-only main...HEAD
```

If a verification defect remains, edit only its exact MoMo-scope file, rerun the full static check, stage that exact path with `git add -- path/to/the/edited/file`, and commit:

```bash
git commit -m "fix(payments): address MoMo verification findings"
```

Do not create an empty commit.

---

## Acceptance Checklist

- [ ] One stable BookingOS pending payment/reference exists before MoMo create.
- [ ] Concurrent/retried MoMo checkout reuses that row/reference.
- [ ] SePay/PayOS/ZaloPay/mock remain provider-first.
- [ ] MoMo create uses stable request identity; payment/refund queries use fresh request IDs.
- [ ] Create/query/refund timeout is 30 seconds.
- [ ] Production callback requires public HTTPS.
- [ ] IPN uses constant-time HMAC plus configured partner and request/order identity.
- [ ] Existing amount guard still rejects mismatch.
- [ ] Pending IPNs do not terminalize payment.
- [ ] MoMo webhook returns 204/no body.
- [ ] Result mapping handles `0`, `9000`, `1000`, `1005`, `7000`, `7002`, and documented final failures.
- [ ] Lost/uncertain payments converge without changing other gateway reconciliation semantics.
- [ ] Refund uncertainty is queried before retry/manual fallback.
- [ ] Same refund attempt reuses one provider identity.
- [ ] Confirmed `1080` schedules one new attempt after one hour; second final retry failure becomes manual.
- [ ] Tenant secrets remain encrypted and never logged.
- [ ] No migration and no test artifacts are added.
- [ ] Full static verification passes.
- [ ] Sandbox UAT passes when credentials/reachability exist.
- [ ] One-tenant production pilot passes before wider rollout.
