# MoMo Production Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make tenant-owned MoMo checkout/refund production-safe with DB-first initiation, provider idempotency, correct IPN/query handling, safe refund uncertainty recovery, and no checkout behavior changes for SePay/PayOS/ZaloPay/mock.

**Architecture:** MoMo opts into an optional `persist_first` checkout capability while all existing gateways default to provider-first. The payment row and stable MoMo order reference are committed before the create-payment network call, MoMo IPN remains the primary source of truth, reconciliation repairs lost/uncertain payment state, and refund attempts use stable per-attempt identities with query-before-retry. Existing RLS, outbox, repository CAS transitions, ledger/settlement behavior, and tenant credential storage remain intact.

**Tech Stack:** Node.js >= 22.22.0, TypeScript, NestJS 11, Prisma/PostgreSQL + RLS/advisory locks, BullMQ outbox/reconciliation workers, React Router 8 dashboard, pnpm 10.13.1, MoMo AIOv2 REST APIs.

**Spec:** `docs/superpowers/specs/2026-08-21-momo-production-hardening-design.md`

## Global Constraints

- Repository hard rule: **NO TEST FILES**. Do not add `*.spec.*`, `*.test.*`, e2e, Jest/Vitest/Playwright config, test scripts, or CI test steps.
- Verification is static checks + running the application + MoMo sandbox/production UAT.
- Backend flow remains `controller -> use-case -> repository-port -> repository`; do not add application service classes.
- Exactly one exported `@Injectable XxxUseCase` with one public `execute()` per use-case file.
- Tenant data must remain inside `TenantDbService.forTenant(tenantId, tx => ...)`; never hold an RLS transaction open across provider network calls.
- Cross-module side effects remain outbox events.
- Money remains `bigint` VND; convert to `number` only after integer/range guards.
- MoMo IPN, not browser redirect, confirms payment.
- MoMo production base URL is `https://payment.momo.vn`; sandbox is `https://test-payment.momo.vn`.
- MoMo create/query/refund calls use a network timeout of at least 30 seconds.
- Create retries reuse the same MoMo `orderId` + `requestId`; payment/refund query requests use fresh `requestId` values so status can advance.
- Existing SePay, PayOS, ZaloPay, and mock checkout lifecycle stays unchanged.
- Prefer no schema migration. If implementation proves a new durable field is required, stop and revise the design before adding one.

---

## File Structure Map

**Create**
- `apps/api/src/modules/payments/infrastructure/gateways/momo-result-code.ts` — pure MoMo result-code classification shared by create/query/IPN/refund logic.

**Modify**
- `apps/api/src/modules/payments/domain/ports/payment-gateway.port.ts` — optional persist-first/reconciliation capabilities plus refund retry metadata.
- `apps/api/src/modules/payments/domain/ports/payment-repository.port.ts` — pending-checkout state, checkout lock, destination persistence.
- `apps/api/src/modules/payments/domain/entities/payment.entity.ts` — pending webhook event is an ignore/no-transition decision.
- `apps/api/src/modules/payments/infrastructure/repositories/prisma-payment.repository.ts` — advisory lock, pending checkout without destination, destination update.
- `apps/api/src/modules/payments/application/use-cases/checkout.use-case.ts` — provider-first path preserved; MoMo persist-first path moved outside provider network transaction.
- `apps/api/src/modules/payments/infrastructure/gateways/momo-gateway.adapter.ts` — timeouts, current result mapping, production IPN URL guard, constant-time IPN verification, unique query request IDs, refund query/retry.
- `apps/api/src/modules/payments/infrastructure/http/webhook.controller.ts` — MoMo 204/no-body acknowledgement.
- `apps/api/src/modules/payments/infrastructure/reconciliation.worker.ts` — apply `failed` only for gateways opting into terminal-failure reconciliation.
- `apps/api/src/shared/outbox/outbox.service.ts` — optional `availableAt` for a durable delayed retry event; default behavior unchanged.
- `apps/api/src/modules/payments/application/use-cases/execute-refund.use-case.ts` — seed automatic refund attempt ordinal `0` in outbox payload.
- `apps/api/src/modules/payments/application/use-cases/execute-automatic-refund.use-case.ts` — handle pending and scheduled retry outcomes without premature manual fallback.
- `apps/api/src/modules/payments/infrastructure/http/payments.module.ts` — pass refund attempt ordinal from outbox event to automatic-refund use case.
- `apps/dashboard/app/features/tenant/components/settings/momo-gateway-card.tsx` — production HTTPS/IPN acknowledgement guidance.
- Relevant payment/deployment docs only if existing prose becomes incorrect after code changes.

---

### Task 1: Define MoMo-safe gateway contracts and result-code classification

**Files:**
- Modify: `apps/api/src/modules/payments/domain/ports/payment-gateway.port.ts`
- Modify: `apps/api/src/modules/payments/domain/entities/payment.entity.ts`
- Create: `apps/api/src/modules/payments/infrastructure/gateways/momo-result-code.ts`

**Interfaces:**
- Produces: `CheckoutInitiation = 'provider_first' | 'persist_first'`.
- Produces: optional `PaymentGatewayPort.checkoutInitiation` and `PaymentGatewayPort.reconcileFailedAsTerminal` capabilities.
- Produces: `WebhookEvent` includes `pending`.
- Produces: `RefundInput.attempt?: number`.
- Produces: `RefundResult.pending?: boolean` and `RefundResult.retryAfterSec?: number` while preserving `supported` for all existing adapters.
- Produces: `mapMomoPaymentResultCode(code)` and refund code helpers for Task 4/6.

- [ ] **Step 1: Extend the gateway port without forcing existing gateway adapters to change behavior**

Update the relevant declarations to this shape:

```ts
export type GatewayKey = 'sepay' | 'payos' | 'momo' | 'zalopay' | 'mock';
export type CheckoutInitiation = 'provider_first' | 'persist_first';
export type WebhookEvent = 'pending' | 'succeeded' | 'failed' | 'expired' | 'refunded';

export interface RefundInput {
  gatewayTxnId: string;
  gatewayOrderRef: string;
  amountVnd: bigint;
  reason: string;
  /** Provider-attempt ordinal; defaults to 0. Same ordinal must reuse the same provider request id. */
  attempt?: number;
}

export interface RefundResult {
  /** false means a final provider/business outcome requires the existing manual workflow. */
  supported: boolean;
  refundId?: string;
  /** true means provider state is not final; redeliver the same attempt identity. */
  pending?: boolean;
  /** final retryable attempt; schedule a NEW attempt identity after this delay. */
  retryAfterSec?: number;
}

export interface PaymentGatewayPort {
  readonly key: GatewayKey;
  /** Omitted means provider_first so existing adapters preserve behavior. */
  readonly checkoutInitiation?: CheckoutInitiation;
  /** Omitted means reconciliation must not newly terminalize provider-reported `failed`. */
  readonly reconcileFailedAsTerminal?: boolean;
  createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult>;
  providerPaymentMethod(method: CustomerPaymentMethod): string;
  peekReference(rawBody: Buffer): string | null;
  verifyWebhook(rawBody: Buffer, headers: Record<string, string>): WebhookVerification;
  refund(input: RefundInput): Promise<RefundResult>;
  queryPaymentStatus(gatewayTxnId: string): Promise<PaymentStatusResult>;
}
```

- [ ] **Step 2: Make pending webhook notifications a no-op transition**

In `Payment.decideWebhookTransition`, preserve refunded behavior and explicitly ignore pending:

```ts
if (event === 'refunded' || event === 'pending') return { action: 'ignore' };
if (event !== 'succeeded') {
  return { action: 'terminal', to: event === 'expired' ? 'expired' : 'failed' };
}
return { action: 'try_succeed' };
```

This prevents MoMo `1000`/`7000`/`7002` IPNs from being incorrectly marked failed.

- [ ] **Step 3: Add the pure MoMo result-code mapper**

Create `momo-result-code.ts` with no Nest/Prisma dependencies:

```ts
import type { PaymentStatusResult } from '../../domain/ports/payment-gateway.port';

const FINAL_PAYMENT_FAILURE_CODES = new Set([
  98,
  99,
  1001,
  1002,
  1003,
  1004,
  1006,
  1007,
  1017,
  1026,
  2019,
  4001,
  4002,
  4100,
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

export function isMomoRefundPending(code: number | undefined): boolean {
  return code === 1000 || code === 7000 || code === 7002;
}

export function isMomoRefundRetryableFailure(code: number | undefined): boolean {
  return code === 1080;
}

export function isMomoRefundManualFailure(code: number | undefined): boolean {
  return code === 1081 || code === 1088;
}
```

Unknown/non-final integration/system codes deliberately stay non-terminal instead of being collapsed to expired/manual.

- [ ] **Step 4: Run compile/static policy checks for this contract task**

Run:

```bash
pnpm check:no-tests
pnpm --filter=@booking/api typecheck
pnpm --filter=@booking/api lint
```

Expected: all commands exit 0; no existing adapter is forced to opt into a new lifecycle.

- [ ] **Step 5: Commit Task 1**

```bash
git add -- apps/api/src/modules/payments/domain/ports/payment-gateway.port.ts \
  apps/api/src/modules/payments/domain/entities/payment.entity.ts \
  apps/api/src/modules/payments/infrastructure/gateways/momo-result-code.ts
git commit -m "refactor(payments): model MoMo lifecycle capabilities"
```

---

### Task 2: Add DB-first checkout repository primitives

**Files:**
- Modify: `apps/api/src/modules/payments/domain/ports/payment-repository.port.ts`
- Modify: `apps/api/src/modules/payments/infrastructure/repositories/prisma-payment.repository.ts`

**Interfaces:**
- Produces: `PendingCheckoutRecord` with nullable destination and provider reference.
- Produces: `IPaymentRepository.lockCheckout(tx, bookingId, paymentMethod)`.
- Produces: `IPaymentRepository.saveCheckoutDestination(tx, paymentId, destination)`.
- Task 3 consumes all three.

- [ ] **Step 1: Replace the old destination-only pending-checkout return type**

Add:

```ts
export interface PendingCheckoutRecord {
  id: string;
  gatewayOrderRef: string | null;
  destination: CheckoutDestination | null;
}
```

Change the repository contract to:

```ts
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

- [ ] **Step 2: Implement the transaction-level checkout advisory lock**

In `PrismaPaymentRepository`:

```ts
async lockCheckout(tx: PrismaTx, bookingId: string, paymentMethod: string): Promise<void> {
  await tx.$executeRaw(
    Prisma.sql`SELECT pg_advisory_xact_lock(hashtext('checkout:' || ${bookingId} || ':' || ${paymentMethod}))`,
  );
}
```

Use the existing refund-repository advisory-lock convention; do not add application-level mutexes.

- [ ] **Step 3: Return pending rows even when provider destination is absent**

Keep the current destination parser, but return `null` destination instead of dropping the row:

```ts
async findPendingCheckout(
  tx: PrismaTx,
  bookingId: string,
  paymentMethod: string,
): Promise<PendingCheckoutRecord | null> {
  const payment = await tx.payment.findFirst({
    where: { bookingId, status: 'pending', paymentMethod },
    select: { id: true, gatewayOrderRef: true, gatewayPayload: true },
    orderBy: { createdAt: 'desc' },
  });
  if (!payment) return null;

  const payload = payment.gatewayPayload;
  const candidate =
    payload && typeof payload === 'object' && !Array.isArray(payload) && 'destination' in payload
      ? payload.destination
      : payload && typeof payload === 'object' && !Array.isArray(payload) && 'paymentUrl' in payload
        ? { type: 'redirect', paymentUrl: payload.paymentUrl }
        : null;
  const parsed = checkoutDestinationSchema.safeParse(candidate);

  return {
    id: payment.id,
    gatewayOrderRef: payment.gatewayOrderRef,
    destination: parsed.success ? parsed.data : null,
  };
}
```

- [ ] **Step 4: Add a guarded handoff persistence method**

```ts
async saveCheckoutDestination(
  tx: PrismaTx,
  paymentId: string,
  destination: CheckoutDestination,
): Promise<void> {
  await tx.payment.updateMany({
    where: { id: paymentId, status: 'pending' },
    data: {
      gatewayPayload: { destination } as Prisma.InputJsonObject,
    },
  });
}
```

The caller may still return the just-created destination even if a concurrent terminal transition makes the guarded write a no-op.

- [ ] **Step 5: Verify repository types**

Run:

```bash
pnpm check:no-tests
pnpm --filter=@booking/api typecheck
pnpm --filter=@booking/api lint
```

Expected: exit 0.

- [ ] **Step 6: Commit Task 2**

```bash
git add -- apps/api/src/modules/payments/domain/ports/payment-repository.port.ts \
  apps/api/src/modules/payments/infrastructure/repositories/prisma-payment.repository.ts
git commit -m "feat(payments): add persist-first checkout repository flow"
```

---

### Task 3: Refactor CheckoutUseCase so only MoMo is DB-first

**Files:**
- Modify: `apps/api/src/modules/payments/application/use-cases/checkout.use-case.ts`

**Interfaces:**
- Consumes: `gateway.checkoutInitiation`, checkout advisory lock, nullable `PendingCheckoutRecord`, `saveCheckoutDestination`.
- Produces: existing `CheckoutResponse`; no public controller/contract change.

- [ ] **Step 1: Keep the provider-first path semantically identical**

Inside the tenant transaction, resolve booking/config/gateway as today. Treat omitted capability as provider-first:

```ts
const initiation = gateway.checkoutInitiation ?? 'provider_first';
const existing = await this.payments.findPendingCheckout(tx, bookingId, providerPaymentMethod);

if (initiation === 'provider_first') {
  if (existing?.destination) {
    return { kind: 'response' as const, response: { paymentId: existing.id, destination: existing.destination } };
  }
  // Keep the current provider create -> payment create sequence for existing gateways.
}
```

Do not move SePay/PayOS/ZaloPay/mock to DB-first in this task.

- [ ] **Step 2: For persist-first, lock before the pending lookup/create decision**

For the MoMo capability branch:

```ts
await this.payments.lockCheckout(tx, bookingId, providerPaymentMethod);
const pending = await this.payments.findPendingCheckout(tx, bookingId, providerPaymentMethod);
if (pending?.destination) {
  return { kind: 'response' as const, response: { paymentId: pending.id, destination: pending.destination } };
}
```

The lookup must happen after lock acquisition so two concurrent requests cannot both pass the missing-row check.

- [ ] **Step 3: Create or reuse the stable MoMo row before the provider call**

Generate a new reference only when no pending row exists:

```ts
const orderRef = pending?.gatewayOrderRef ?? `BKF-${randomUUID().replaceAll('-', '').toUpperCase()}`;
if (pending && !pending.gatewayOrderRef) {
  throw new Error('Pending persist-first payment is missing gatewayOrderRef');
}

const payment = pending
  ? { id: pending.id }
  : await this.payments.create(tx, tenant.id, {
      bookingId,
      gateway: gateway.key,
      kind,
      amount,
      gatewayOrderRef: orderRef,
      paymentMethod: providerPaymentMethod,
      idempotencyKey: `checkout:${bookingId}:${paymentMethod}:${orderRef}`,
    });
```

Return a private discriminated object from the transaction containing the gateway instance, payment id, orderRef, amount, description, URLs, expiration, and customer method.

- [ ] **Step 4: Call MoMo only after the first tenant transaction commits**

After `forTenant(...)` returns:

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

Do not catch-and-generate a new order reference on provider timeout/error. Let the request fail; the next storefront retry finds the same pending row and reuses the same orderRef.

- [ ] **Step 5: Add safe operational logging around the persist-first provider call**

Use Nest `Logger` in `CheckoutUseCase` and log identifiers only:

```ts
private readonly logger = new Logger(CheckoutUseCase.name);
```

On provider failure:

```ts
this.logger.warn({
  event: 'payment.persist_first_create_failed',
  tenantId: prepared.tenantId,
  paymentId: prepared.paymentId,
  gateway: prepared.gateway.key,
  gatewayOrderRef: prepared.orderRef,
  error: error instanceof Error ? error.message : String(error),
});
```

Never log credentials/signatures.

- [ ] **Step 6: Verify checkout compilation and policy**

Run:

```bash
pnpm check:no-tests
pnpm --filter=@booking/api typecheck
pnpm --filter=@booking/api lint
pnpm check:module-cycles
```

Expected: exit 0.

- [ ] **Step 7: Commit Task 3**

```bash
git add -- apps/api/src/modules/payments/application/use-cases/checkout.use-case.ts
git commit -m "feat(payments): persist MoMo checkout before provider create"
```

---

### Task 4: Harden MoMo create/query/IPN behavior

**Files:**
- Modify: `apps/api/src/modules/payments/infrastructure/gateways/momo-gateway.adapter.ts`
- Uses: `apps/api/src/modules/payments/infrastructure/gateways/momo-result-code.ts`

**Interfaces:**
- Produces: `checkoutInitiation = 'persist_first'`.
- Produces: `reconcileFailedAsTerminal = true`.
- Produces: safe `createPayment`, `verifyWebhook`, `queryPaymentStatus` semantics.

- [ ] **Step 1: Add capabilities and cryptographic helpers**

Use:

```ts
import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { mapMomoPaymentResultCode } from './momo-result-code';

readonly key: GatewayKey = 'momo';
readonly checkoutInitiation = 'persist_first' as const;
readonly reconcileFailedAsTerminal = true;
```

Add constant-time comparison:

```ts
function sameHex(expected: string, actual: string): boolean {
  if (!/^[0-9a-f]+$/i.test(expected) || !/^[0-9a-f]+$/i.test(actual)) return false;
  const left = Buffer.from(expected, 'hex');
  const right = Buffer.from(actual, 'hex');
  return left.length === right.length && timingSafeEqual(left, right);
}
```

- [ ] **Step 2: Make MoMo query request IDs fresh per query**

Add a <=50-character request-id helper:

```ts
function queryRequestId(prefix: 'PQ' | 'RQ'): string {
  return `${prefix}${randomUUID().replaceAll('-', '')}`.slice(0, 50);
}
```

`queryPaymentStatus(reference)` must use `queryRequestId('PQ')`, not a deterministic hash of `reference`. The stable identifier being queried is still `orderId = reference`; only the query request's own id is fresh.

- [ ] **Step 3: Enforce a valid public HTTPS IPN URL in production**

Implement production validation in `ipnUrl()`:

```ts
private ipnUrl(): string {
  const rawOrigin = process.env.PUBLIC_API_URL ?? 'http://localhost:3000';
  const origin = new URL(rawOrigin);
  if (this.creds.environment === 'production') {
    const localHostnames = new Set(['localhost', '127.0.0.1', '[::1]']);
    if (origin.protocol !== 'https:' || localHostnames.has(origin.hostname)) {
      throw new Error('MoMo production requires PUBLIC_API_URL to be a public HTTPS origin');
    }
  }
  return `${origin.toString().replace(/\/+$/, '')}/webhooks/momo`;
}
```

A malformed `PUBLIC_API_URL` should fail before sending a production payment request.

- [ ] **Step 4: Add 30-second timeout and explicit HTTP handling to create**

The create fetch must include:

```ts
signal: AbortSignal.timeout(30_000),
```

Check `res.ok` before trusting JSON. Keep `orderId = requestId = input.orderCode`. For any non-success/uncertain response, throw without changing the order reference; Task 3 guarantees retry uses the same pending payment/reference.

Keep `captureWallet` and `autoCapture: true`. Do not make correctness depend on `orderExpireTime`; retain it only if sandbox accepts it during Task 8 UAT.

- [ ] **Step 5: Harden IPN parsing and verification**

`verifyWebhook` must never throw on malformed JSON. Return a safe invalid verification object when parsing fails.

For valid JSON, build the documented raw signature exactly as today, then require all of:

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

Return `valid: signatureValid && partnerValid && referenceValid`. Amount remains checked against the stored payment by the existing `HandleWebhookUseCase`/`Payment.assertAmountCovers` path.

- [ ] **Step 6: Fix payment query status mapping and timeout**

Use a fresh query request id and 30-second timeout:

```ts
const requestId = queryRequestId('PQ');
const res = await fetch(`${this.base}/v2/gateway/api/query`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ partnerCode, requestId, orderId: reference, lang: 'vi', signature }),
  signal: AbortSignal.timeout(30_000),
});
```

Return:

```ts
return {
  status: mapMomoPaymentResultCode(json.resultCode),
  amountVnd: BigInt(json.amount ?? 0),
  gatewayTxnId: json.transId !== undefined ? String(json.transId) : undefined,
};
```

Do not map every unknown non-zero code to expired.

- [ ] **Step 7: Verify adapter compilation**

Run:

```bash
pnpm check:no-tests
pnpm --filter=@booking/api typecheck
pnpm --filter=@booking/api lint
```

Expected: exit 0.

- [ ] **Step 8: Commit Task 4**

```bash
git add -- apps/api/src/modules/payments/infrastructure/gateways/momo-gateway.adapter.ts \
  apps/api/src/modules/payments/infrastructure/gateways/momo-result-code.ts
git commit -m "fix(payments): harden MoMo create query and IPN"
```

---

### Task 5: Return MoMo 204 and reconcile final MoMo failures safely

**Files:**
- Modify: `apps/api/src/modules/payments/infrastructure/http/webhook.controller.ts`
- Modify: `apps/api/src/modules/payments/infrastructure/reconciliation.worker.ts`

**Interfaces:**
- Consumes: `gateway.reconcileFailedAsTerminal`.
- Produces: `/webhooks/momo` HTTP 204 with no body; other gateway acknowledgement behavior unchanged.

- [ ] **Step 1: Make the webhook controller able to set a per-gateway status**

Import Express response and Nest response decorator:

```ts
import { Controller, HttpCode, Param, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
```

Use passthrough response injection:

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

Change the return type to `Promise<WebhookAcknowledgementResponse | void>`.

Add Swagger `ApiNoContentResponse` for MoMo while retaining existing 200 response documentation for generic/ZaloPay responses.

- [ ] **Step 2: Apply queried `failed` only for gateways that explicitly opt in**

Inside reconciliation's tenant transaction, before the succeeded branch:

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

Because only MoMo opts in in this change, SePay/PayOS/ZaloPay/mock reconciliation behavior remains unchanged.

- [ ] **Step 3: Verify controller/worker compilation**

Run:

```bash
pnpm check:no-tests
pnpm --filter=@booking/api typecheck
pnpm --filter=@booking/api lint
pnpm check:module-cycles
```

Expected: exit 0.

- [ ] **Step 4: Commit Task 5**

```bash
git add -- apps/api/src/modules/payments/infrastructure/http/webhook.controller.ts \
  apps/api/src/modules/payments/infrastructure/reconciliation.worker.ts
git commit -m "fix(payments): acknowledge and reconcile MoMo correctly"
```

---

### Task 6: Make MoMo refunds query-before-retry and schedule one safe 1080 retry

**Files:**
- Modify: `apps/api/src/shared/outbox/outbox.service.ts`
- Modify: `apps/api/src/modules/payments/application/use-cases/execute-refund.use-case.ts`
- Modify: `apps/api/src/modules/payments/application/use-cases/execute-automatic-refund.use-case.ts`
- Modify: `apps/api/src/modules/payments/infrastructure/http/payments.module.ts`
- Modify: `apps/api/src/modules/payments/infrastructure/gateways/momo-gateway.adapter.ts`

**Interfaces:**
- Consumes: `RefundInput.attempt`, `RefundResult.pending`, `RefundResult.retryAfterSec`.
- Produces: optional `OutboxService.emit(... availableAt)` scheduling used only for MoMo retryable refund finality.
- Preserves: other gateways' existing refund behavior because all new fields are optional.

- [ ] **Step 1: Allow outbox events to be created with a future `availableAt`**

Extend the optional emit contract:

```ts
export interface EmitOptions {
  tenantId?: string;
  eventType: string;
  payload: Prisma.InputJsonValue;
  availableAt?: Date;
}
```

Persist only when provided:

```ts
data: {
  tenantId: options.tenantId,
  eventType: options.eventType,
  payload: options.payload,
  ...(options.availableAt ? { availableAt: options.availableAt } : {}),
},
```

All existing callers keep current `now()` default behavior.

- [ ] **Step 2: Put automatic refund attempt ordinal in the durable event payload**

In `ExecuteRefundUseCase`, when emitting `refund.execution_requested`, include:

```ts
payload: {
  refundId: refund.id,
  paymentId: payment.id,
  bookingId,
  amount: amount.toString(),
  reason,
  affectsBookingStatus,
  ...(planned.executionMode === 'automatic' ? { attempt: 0 } : {}),
},
```

- [ ] **Step 3: Pass attempt ordinal through the payments outbox handler**

Change the handler payload and call:

```ts
const p = event.payload as { refundId: string; attempt?: number };
return this.automaticRefunds.execute(tenantId, p.refundId, p.attempt ?? 0);
```

- [ ] **Step 4: Extend ExecuteAutomaticRefundUseCase with non-terminal outcomes**

Change the signature:

```ts
async execute(tenantId: string, refundId: string, attempt = 0): Promise<void>
```

Pass the ordinal:

```ts
let result = await prepared.gateway.refund({
  gatewayTxnId: prepared.payment.gatewayTxnId ?? reference,
  gatewayOrderRef: reference,
  amountVnd: prepared.refund.amount,
  reason: prepared.refund.reason ?? 'booking_cancellation',
  attempt,
});
```

Immediately after provider call:

```ts
if (result.pending) {
  throw new Error(`Gateway refund attempt ${attempt} is still pending`);
}

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

Then retain the existing success/manual-fallback logic. A pending result throws so the **same outbox event payload/attempt ordinal** is retried; a confirmed `1080` schedules a **new attempt ordinal** instead.

- [ ] **Step 5: Derive stable MoMo refund request identity from logical refund + attempt ordinal**

Change the helper to:

```ts
function momoRefundId(idempotencyKey: string, attempt: number): string {
  return `RF${createHash('sha256')
    .update(`${idempotencyKey}:attempt:${attempt}`)
    .digest('hex')
    .slice(0, 32)}`;
}
```

In `refund(input)`, use:

```ts
const attempt = input.attempt ?? 0;
const id = momoRefundId(`${input.gatewayOrderRef}:${input.reason}`, attempt);
```

Same ordinal always reuses the same MoMo `orderId` + `requestId`.

- [ ] **Step 6: Add a MoMo refund-query helper before every refund POST**

Use a fresh query request id each time:

```ts
private async queryRefundAttempt(orderId: string): Promise<{
  resultCode?: number;
  refundTrans?: Array<{ orderId?: string; amount?: number; resultCode?: number; transId?: number }>;
}> {
  const { partnerCode, accessKey } = this.creds;
  const requestId = queryRequestId('RQ');
  const raw =
    `accessKey=${accessKey}&orderId=${orderId}&partnerCode=${partnerCode}&requestId=${requestId}`;
  const res = await fetch(`${this.base}/v2/gateway/api/refund/query`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      partnerCode,
      requestId,
      orderId,
      lang: 'vi',
      signature: this.sign(raw),
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`MoMo refund query failed with ${res.status}`);
  return (await res.json()) as {
    resultCode?: number;
    refundTrans?: Array<{ orderId?: string; amount?: number; resultCode?: number; transId?: number }>;
  };
}
```

Before POSTing `/refund`, query the same attempt id. Interpret the matching `refundTrans` row when present:

```ts
const prior = await this.queryRefundAttempt(id);
const priorAttempt = prior.refundTrans?.find((item) => item.orderId === id);
const priorCode = priorAttempt?.resultCode ?? prior.resultCode;

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

If the query is inconclusive/not-found, POST the **same attempt id**; MoMo idempotency still prevents a duplicate if query visibility lagged.

- [ ] **Step 7: Interpret refund POST result without premature manual fallback**

Keep the 30-second timeout. After JSON:

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

This gives one automatic retry after the documented preferred one-hour delay for confirmed code `1080`; if that second provider attempt also reaches a final retryable failure, use the existing manual workflow instead of retrying forever.

- [ ] **Step 8: Preserve existing transaction-status fallback only for final unsupported outcomes**

Keep the existing `queryPaymentStatus(reference)` fallback after `supported: false`; if the original payment is already reported `refunded`, reconcile it to success as today. Do not run that fallback for `pending` or scheduled-retry results.

- [ ] **Step 9: Verify refund/outbox compilation**

Run:

```bash
pnpm check:no-tests
pnpm --filter=@booking/api typecheck
pnpm --filter=@booking/api lint
pnpm check:module-cycles
```

Expected: exit 0.

- [ ] **Step 10: Commit Task 6**

```bash
git add -- apps/api/src/shared/outbox/outbox.service.ts \
  apps/api/src/modules/payments/application/use-cases/execute-refund.use-case.ts \
  apps/api/src/modules/payments/application/use-cases/execute-automatic-refund.use-case.ts \
  apps/api/src/modules/payments/infrastructure/http/payments.module.ts \
  apps/api/src/modules/payments/infrastructure/gateways/momo-gateway.adapter.ts
git commit -m "fix(payments): make MoMo refunds retry-safe"
```

---

### Task 7: Update MoMo production guidance and operational logging

**Files:**
- Modify: `apps/dashboard/app/features/tenant/components/settings/momo-gateway-card.tsx`
- Modify: `apps/api/src/modules/payments/application/use-cases/execute-automatic-refund.use-case.ts`
- Modify: `apps/api/src/modules/payments/application/use-cases/checkout.use-case.ts` only if Task 3 logging needs final adjustment.
- Modify: payment/deployment documentation only where current text contradicts implemented behavior.

**Interfaces:**
- No API/DB contract changes.
- Produces: operator-visible guidance and identifier-only structured logs.

- [ ] **Step 1: Make dashboard production setup instructions explicit**

Update the MoMo setup steps to communicate:

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

- [ ] **Step 2: Log refund uncertainty without credentials**

Add a Nest `Logger` to `ExecuteAutomaticRefundUseCase`. Before throwing/scheduling:

```ts
this.logger.warn({
  event: result.pending ? 'refund.provider_pending' : 'refund.provider_retry_scheduled',
  tenantId,
  refundId,
  paymentId: prepared.payment.id,
  gateway: prepared.payment.gateway,
  gatewayOrderRef: reference,
  attempt,
  retryAfterSec: result.retryAfterSec,
});
```

Do not include accessKey, secretKey, signatures, raw credential blobs, or full webhook payloads.

- [ ] **Step 3: Update stale docs only if implementation changed documented behavior**

Search:

```bash
rg -n "MoMo|webhooks/momo|refund/query|captureWallet|resultCode" docs AGENTS.md tasks apps/api/README.md
```

If an authoritative doc states behavior contradicted by the implementation, update that specific prose. Do not revive stale task checkboxes or add test requirements forbidden by `AGENTS.md`.

- [ ] **Step 4: Verify dashboard/API compilation**

Run:

```bash
pnpm check:no-tests
pnpm --filter=@booking/api typecheck
pnpm --filter=@booking/dashboard typecheck
pnpm --filter=@booking/api lint
pnpm --filter=@booking/dashboard lint
```

Expected: exit 0.

- [ ] **Step 5: Commit Task 7**

Stage only files actually changed:

```bash
git add -- apps/dashboard/app/features/tenant/components/settings/momo-gateway-card.tsx \
  apps/api/src/modules/payments/application/use-cases/execute-automatic-refund.use-case.ts \
  apps/api/src/modules/payments/application/use-cases/checkout.use-case.ts \
  docs
git commit -m "docs(payments): clarify MoMo production operations"
```

If no docs outside the dashboard changed, omit `docs` from `git add`.

---

### Task 8: Full static verification and MoMo runtime UAT

**Files:**
- No new test files.
- Modify only code/docs needed to fix concrete verification failures; keep fixes within this plan's scope.

**Interfaces:**
- Validates all prior tasks against repository policy and the approved spec.

- [ ] **Step 1: Confirm no prohibited test artifacts were introduced**

Run:

```bash
pnpm check:no-tests
git diff --name-only main...HEAD | rg '\.(spec|test)\.' && exit 1 || true
```

Expected: `pnpm check:no-tests` exits 0 and the diff scan finds no test files.

- [ ] **Step 2: Run the repository's full required static verification**

Run exactly:

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

Expected: every command exits 0. Fix only failures caused by this branch; do not absorb unrelated refactors.

- [ ] **Step 3: Start the local/staging stack using the repository runbook**

Use the documented environment rather than inventing credentials:

```bash
docker compose up -d
pnpm --filter=@booking/api prisma:deploy
pnpm dev
```

Configure a tenant's MoMo **sandbox** credentials through the existing tenant dashboard. Ensure `PUBLIC_API_URL` is a public HTTPS tunnel/staging origin that MoMo can reach for IPN; do not use localhost for provider callbacks.

- [ ] **Step 4: Execute the sandbox payment matrix**

For one sandbox-configured tenant, verify in runtime logs + DB-visible application screens:

1. successful MoMo wallet checkout redirects and later reaches `succeeded` only via IPN/query;
2. customer cancellation/rejection becomes final failure, not success;
3. expiration becomes `expired`;
4. double-click/concurrent checkout returns/reuses one pending BookingOS payment and one `gatewayOrderRef`;
5. a create timeout/error leaves the payment pending without a destination and the next request reuses the same `orderId/requestId`;
6. duplicate/in-flight create (`422`/`7000`) does not create a second payment row;
7. losing the browser return does not prevent IPN confirmation;
8. delaying/blocking IPN allows reconciliation query to converge the payment;
9. invalid signature/partner/reference/amount does not transition payment;
10. MoMo webhook responds 204/no body.

Do not fabricate a sandbox pass if real sandbox credentials/network reachability are unavailable; report UAT as blocked while still reporting static verification separately.

- [ ] **Step 5: Execute the sandbox refund matrix**

Verify:

1. successful automatic refund completes one refund row;
2. uncertain `7000/7002` remains pending and redrives the same attempt identity;
3. a lost refund response is queried before another POST, so no double-refund occurs;
4. confirmed `1080` schedules attempt `1` at +3600 seconds and does not mark manual immediately;
5. a second confirmed `1080`, `1081`, or `1088` reaches the existing manual-required workflow;
6. successful refund completion still emits `refund.completed` and downstream booking/settlement projections converge.

- [ ] **Step 6: Sandbox-validate `orderExpireTime` with `captureWallet`**

Inspect the real MoMo sandbox create response with the current request field. If accepted and expiry behavior is correct, retain it. If MoMo rejects/ignores it incompatibly, remove `orderExpireTime` from the `captureWallet` body and rely on BookingOS stale reconciliation plus provider finality. Re-run Steps 2, 4, and 5 after any change.

- [ ] **Step 7: Pilot production only when credentials and public HTTPS IPN are available**

For exactly one tenant:

1. switch tenant config to production credentials;
2. perform a small real payment;
3. verify MoMo IPN -> payment -> booking -> settlement convergence;
4. perform one real refund and verify provider + BookingOS convergence;
5. inspect logs for invalid signatures, long pending state, duplicate payment rows, or refund uncertainty before enabling another tenant.

Never place production credentials in source, docs, commits, shell history copied into docs, or chat output.

- [ ] **Step 8: Final branch review and commit any verification-only fixes**

Review:

```bash
git status --short
git diff --stat main...HEAD
git diff main...HEAD -- apps/api/src/modules/payments apps/api/src/shared/outbox apps/dashboard/app/features/tenant/components/settings docs
```

Stage only confirmed MoMo-scope fixes, then commit if necessary:

```bash
git add -- <only-the-confirmed-files>
git commit -m "fix(payments): address MoMo verification findings"
```

If there are no fixes, do not create an empty commit.

---

## Final Acceptance Checklist

- [ ] One stable BookingOS pending payment/reference exists before MoMo create.
- [ ] Concurrent/retried MoMo checkout reuses that row/reference.
- [ ] SePay, PayOS, ZaloPay, and mock checkout behavior remains provider-first and unchanged.
- [ ] MoMo create uses stable `orderId/requestId`; MoMo payment/refund queries use fresh request IDs.
- [ ] Create/query/refund use 30-second timeouts.
- [ ] Production MoMo refuses a non-public/non-HTTPS callback origin.
- [ ] MoMo IPN uses constant-time signature comparison and checks partner + request/order identity + amount through existing application guard.
- [ ] Pending MoMo IPNs do not terminalize a payment.
- [ ] `/webhooks/momo` responds 204/no body.
- [ ] Query result mapping handles `0`, `9000`, `1000`, `1005`, `7000`, `7002`, and documented final failures correctly.
- [ ] Lost IPN/uncertain payment state converges through reconciliation without changing other gateways' reconciliation semantics.
- [ ] Refund query runs before retry/manual fallback for uncertain MoMo refund state.
- [ ] Same refund attempt reuses the same provider identity; confirmed `1080` schedules one new attempt identity after one hour.
- [ ] Terminal refund failure falls into the existing manual workflow without double-refund.
- [ ] Tenant secrets remain encrypted and are never logged or returned to the UI.
- [ ] No schema migration was needed; if one becomes necessary, implementation stops for design revision.
- [ ] No test files/config/scripts were introduced.
- [ ] Full repository static verification passes.
- [ ] Sandbox UAT passes when real credentials/reachability are available.
- [ ] One-tenant production pilot passes before wider rollout.
