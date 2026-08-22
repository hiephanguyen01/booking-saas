# Durable Checkout + payOS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make checkout durable and retry-safe by persisting/claiming a Payment before provider I/O, moving provider network calls outside DB transactions, and hardening payOS for deterministic numeric order codes, fixed server-side endpoints, exact captured amounts, and bounded provider HTTP behavior.

**Architecture:** The persisted `Payment.id` is the canonical checkout-attempt identity. A short transaction validates/locks the booking checkout scope, reuses a legal pending attempt or creates one with `checkoutState=creating`, stable `idempotencyKey`, selected config revision, and any provider reference that can be deterministically prepared. After commit, the adapter is resolved from the payment revision and provider I/O runs without an open DB transaction. A final short transaction attaches the handoff and marks `ready`. payOS maps the payment ID to a deterministic JS-safe numeric `orderCode`; retries first query by that order code, so a timeout after provider acceptance can recover the existing payment link rather than create a second resource.

**Tech Stack:** NestJS 11, Prisma/PostgreSQL advisory locks, Node `crypto`, `uuid` v7, native `fetch`/AbortSignal, payOS REST API, Zod contracts, pnpm/Turbo.

**Spec:** `docs/superpowers/specs/2026-08-22-payment-core-hardening-design.md`

## Global Constraints

- PR1 payment foundation must be merged/applied first.
- No automated tests/test runners. Use static checks plus disposable/manual runtime smoke per ADR 0005.
- Do not run `prisma migrate dev`; any new index is a hand-written migration.
- No provider network call while a `TenantDbService.forTenant()` transaction is open.
- Webhook remains the only source of successful settlement. Return/cancel URLs never mark success.
- Same logical pending checkout attempt reuses the same `Payment.id`, idempotency key, config revision, and provider reference.
- A new payment row may be created only when there is no reusable `creating|ready` pending attempt for the same booking payment kind and storefront payment method.
- User switching to a different legal payment method may create a separate pending attempt; whichever provider succeeds first remains governed by existing booking/payment outbox idempotency.
- For configured real gateways, `gatewayConfigRevisionId` must be non-null before provider I/O.
- Do not hold a DB lock while waiting for provider I/O.
- payOS tenant input must not control API/checkout hosts.
- payOS production API host is `https://api-merchant.payos.vn`; hosted checkout handoff uses the official `https://pay.payos.vn/web/<paymentLinkId>` shape returned by payOS create responses. Keep these infrastructure constants server-side.
- payOS `orderCode` is persisted before provider create so an early webhook can resolve the local payment by `orderCode` even if `paymentLinkId` has not yet been attached.
- payOS order-code generation must stay within `Number.MAX_SAFE_INTEGER`; conversion to `number` occurs only after validation.
- Fixed-amount checkout requires exact provider amount equality. Mismatches do not emit `payment.succeeded`.
- Do not implement MoMo result classification/refund-query here; PR3 owns MoMo hardening. Shared interface/helper changes may include compile-compatible updates to MoMo/ZaloPay/SePay/mock.
- No merge/deploy without separate authorization.

## File Map

**Checkout orchestration / persistence**
- Modify `apps/api/src/modules/payments/application/use-cases/checkout.use-case.ts` — three-phase durable checkout.
- Modify `apps/api/src/modules/payments/domain/ports/payment-repository.port.ts` — checkout attempt lock/claim/read/attach/create-failure/capture-observation operations.
- Modify `apps/api/src/modules/payments/infrastructure/repositories/prisma-payment.repository.ts` — advisory lock + guarded checkout writes.
- Modify `apps/api/src/modules/payments/domain/ports/payment-gateway.port.ts` — canonical payment identity and optional deterministic pre-create reference seam.
- Modify `apps/api/src/modules/payments/infrastructure/gateway-registry.ts` only as required to bind the already-selected historical revision outside the original checkout transaction.

**payOS / provider HTTP**
- Modify `packages/contracts/src/contracts/payment.ts` — remove tenant-controlled payOS `baseUrl`.
- Create `apps/api/src/modules/payments/infrastructure/gateways/provider-http.ts` — pure provider HTTP helper/error classification, not an application service.
- Modify `apps/api/src/modules/payments/infrastructure/gateways/payos-gateway.adapter.ts` — numeric order code, lookup-before-create recovery, fixed hosts, timeout/status parsing, constant-time signature compare.
- Modify `apps/api/src/modules/payments/infrastructure/gateways/{mock,sepay,momo,zalopay}-gateway.adapter.ts` only for shared port compile compatibility.

**Amount correctness / reconciliation**
- Modify `apps/api/src/modules/payments/domain/payment-status.ts` — exact match.
- Modify `apps/api/src/modules/payments/domain/entities/payment.entity.ts` — exact-match naming/comment + MoMo min amount guard if shared acceptance is touched.
- Modify `apps/api/src/modules/payments/application/use-cases/handle-webhook.use-case.ts` — persist/observe mismatched capture without success; acknowledge verified mismatch.
- Modify `apps/api/src/modules/payments/infrastructure/reconciliation.worker.ts` — same exact-match behavior and observation.

**DB uniqueness if not already equivalent**
- Create `apps/api/prisma/migrations/20260822030000_payos_order_reference_unique/migration.sql` only if inspection confirms no existing constraint safely guarantees unique non-null payOS order refs platform-wide.
- Modify `apps/api/prisma/schema.prisma` only if a Prisma-expressible supporting index is needed; provider-specific partial SQL remains migration-only.

---

### Task 1: Define durable checkout repository operations and canonical attempt identity

**Produces:**

```ts
export interface CheckoutAttemptRecord {
  payment: PaymentRecord;
  destination: CheckoutDestination | null;
}

export interface CreatePendingCheckoutData extends CreatePaymentData {
  id: string;
  checkoutState: 'creating';
  gatewayConfigRevisionId: string | null;
  gatewayOrderRef?: string | null;
}

export interface IPaymentRepository {
  // existing methods...
  lockCheckoutAttempt(
    tx: PrismaTx,
    bookingId: string,
    kind: PaymentKind,
    paymentMethod: string,
  ): Promise<void>;
  findReusableCheckoutAttempt(
    tx: PrismaTx,
    bookingId: string,
    kind: PaymentKind,
    paymentMethod: string,
  ): Promise<CheckoutAttemptRecord | null>;
  createPendingCheckout(
    tx: PrismaTx,
    tenantId: string,
    data: CreatePendingCheckoutData,
  ): Promise<PaymentRecord>;
  markCheckoutReady(
    tx: PrismaTx,
    paymentId: string,
    data: {
      destination: CheckoutDestination;
      gatewayTxnId?: string | null;
      gatewayOrderRef?: string | null;
      paymentMethod?: string | null;
    },
  ): Promise<boolean>;
  markCheckoutCreateFailed(tx: PrismaTx, paymentId: string): Promise<boolean>;
  recordCapturedAmountIfPending(tx: PrismaTx, paymentId: string, amount: bigint): Promise<void>;
}
```

- [ ] **Step 1: Add explicit payment ID support to the create data path.**

Checkout will generate a UUID v7 using the existing `uuid` package:

```ts
import { v7 as uuidv7 } from 'uuid';
```

Persist that exact ID and set:

```ts
idempotencyKey: `checkout:${paymentId}`
```

The idempotency key is therefore stable before the provider call.

- [ ] **Step 2: Add `lockCheckoutAttempt()` in the Prisma repository.**

Use `pg_advisory_xact_lock` on a deterministic text key containing booking ID + payment kind + provider-normalized payment method. The lock exists only for the short DB phase.

Example shape:

```sql
SELECT pg_advisory_xact_lock(
  hashtext('payment-checkout:' || <bookingId> || ':' || <kind> || ':' || <paymentMethod>)
)
```

- [ ] **Step 3: Implement `findReusableCheckoutAttempt()`.**

Reusable means:
- same booking;
- same `kind`;
- same persisted provider payment method;
- financial `status='pending'`;
- `checkoutState IN ('creating','ready')`.

Parse any stored `destination` through `checkoutDestinationSchema`. `ready` without a valid destination is an invariant failure, not a silent success.

Legacy rows with `checkoutState=NULL` remain readable by old status/history paths but are not claimed as new durable attempts unless they contain a valid existing handoff and the implementation intentionally maps them through the existing `findPendingCheckout` compatibility path.

- [ ] **Step 4: Implement guarded handoff writes.**

`markCheckoutReady` updates only a non-terminal pending attempt still in `creating|ready` and stores destination/provider references atomically. Duplicate success writes are idempotent.

`markCheckoutCreateFailed` changes only `checkout_state` from `creating` to `create_failed`. Do not emit financial success/failure outbox events.

- [ ] **Step 5: Implement capture observation.**

`recordCapturedAmountIfPending` writes the provider-observed amount while keeping financial status pending. This supports operator visibility for over/underpayment without settling it.

- [ ] **Step 6: Verify targeted API typecheck/lint and commit.**

```bash
pnpm --filter=@booking/api lint
pnpm --filter=@booking/api typecheck

git add apps/api/src/modules/payments/domain/ports/payment-repository.port.ts \
  apps/api/src/modules/payments/infrastructure/repositories/prisma-payment.repository.ts
git commit -m "refactor(payments): add durable checkout persistence"
```

---

### Task 2: Add a provider-neutral pre-create reference seam without leaking provider format into core

**File:** `payment-gateway.port.ts` + compile-compatible adapters.

**Contract direction:**

```ts
export interface CreatePaymentInput {
  paymentId: string;
  gatewayOrderRef: string | null;
  amountVnd: bigint;
  description: string;
  returnUrl: string;
  errorUrl: string;
  cancelUrl: string;
  expiresInSec: number;
  paymentMethod: CustomerPaymentMethod;
}

export interface PaymentGatewayPort {
  readonly key: GatewayKey;
  prepareOrderReference(paymentId: string): string | null;
  createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult>;
  // existing methods...
}
```

`prepareOrderReference()` is pure/synchronous. Core persists the opaque returned string but never parses provider format.

- [ ] **Step 1: Add `paymentId` and `gatewayOrderRef` to create input; remove the semantic assumption that `orderCode` is a universal provider field.**

- [ ] **Step 2: Implement payOS `prepareOrderReference(paymentId)` as deterministic numeric text.**

Use a domain-separated SHA-256 digest and a 52-bit positive value, e.g.:

```ts
const digest = createHash('sha256').update(`payos-order:${paymentId}`).digest();
const mask52 = (1n << 52n) - 1n;
const value = digest.readBigUInt64BE(0) & mask52;
return (value === 0n ? 1n : value).toString();
```

Before sending to payOS:

```ts
const orderCode = Number(input.gatewayOrderRef);
if (!Number.isSafeInteger(orderCode) || orderCode <= 0) throw ...;
```

- [ ] **Step 3: Keep other adapters compile-compatible without feature expansion.**

For dormant/legacy providers, either return the stable format they can derive safely or `null` and continue deriving their provider ID inside `createPayment()` until their dedicated hardening phase. MoMo receives its full stable identity implementation in PR3.

- [ ] **Step 4: Make payOS webhook lookup prefer the pre-persisted `orderCode`.**

Official payOS webhook data includes both `orderCode` and `paymentLinkId`. `peekReference()` should return `String(orderCode)` so a webhook can resolve a local Payment even if it arrives before `paymentLinkId` was attached. Verified webhook data should report:
- `gatewayOrderRef = String(orderCode)`;
- `gatewayTxnId = paymentLinkId` when present.

`findByGatewayReference()` already searches both columns.

- [ ] **Step 5: Add provider-specific uniqueness protection for payOS order refs if absent.**

Inspect existing DB indexes first. If no safe equivalent exists, hand-write:

```sql
CREATE UNIQUE INDEX "payments_payos_order_ref_unique"
ON "payments" ("gateway_order_ref")
WHERE "gateway" = 'payos'::payment_gateway
  AND "gateway_order_ref" IS NOT NULL;
```

This prevents an extremely unlikely deterministic-hash collision from creating cross-tenant webhook ambiguity. Repository checkout creation must translate a constraint collision into a named retryable internal outcome so the use case can generate a fresh UUID v7/payment attempt identity before any provider call. Cap local collision retries at a small constant such as 3; exhausting it is a 5xx invariant failure.

- [ ] **Step 6: If the index migration is needed, apply it via ADR 0004 flow.**

```bash
pnpm --filter=@booking/api prisma:deploy
pnpm --filter=@booking/api prisma:generate
pnpm --filter=@booking/api check:rls
```

- [ ] **Step 7: Commit.**

```bash
git add apps/api/src/modules/payments/domain/ports/payment-gateway.port.ts \
  apps/api/src/modules/payments/infrastructure/gateways/mock-gateway.adapter.ts \
  apps/api/src/modules/payments/infrastructure/gateways/sepay-gateway.adapter.ts \
  apps/api/src/modules/payments/infrastructure/gateways/payos-gateway.adapter.ts \
  apps/api/src/modules/payments/infrastructure/gateways/momo-gateway.adapter.ts \
  apps/api/src/modules/payments/infrastructure/gateways/zalopay-gateway.adapter.ts \
  apps/api/prisma/schema.prisma \
  apps/api/prisma/migrations/20260822030000_payos_order_reference_unique/migration.sql
git commit -m "refactor(payments): persist provider checkout references"
```

Only stage schema/migration paths if actually changed/created.

---

### Task 3: Implement shared outbound provider HTTP policy

**Create:** `apps/api/src/modules/payments/infrastructure/gateways/provider-http.ts`.

This is a pure infrastructure helper, not an injectable service.

**Produces:**

```ts
export type GatewayFailureKind = 'retryable' | 'configuration' | 'final';

export class GatewayRequestError extends Error {
  constructor(
    public readonly kind: GatewayFailureKind,
    message: string,
    options?: { cause?: unknown; status?: number },
  ) { ... }
}

export async function providerJson<T>(input: {
  url: string;
  init: RequestInit;
  timeoutMs: number;
  parse: (value: unknown) => T;
  classifyHttpStatus?: (status: number) => GatewayFailureKind;
}): Promise<T>;
```

- [ ] **Step 1: Add finite AbortSignal timeout.**

Use `AbortSignal.timeout(timeoutMs)` or an equivalent native controller. Default call sites should explicitly pass a timeout; use 30 seconds for payment-provider calls unless provider docs require a larger value.

- [ ] **Step 2: Validate HTTP status before trusting JSON.**

Default classification:
- `401/403` -> `configuration`;
- `408/425/429/5xx` -> `retryable`;
- other `4xx` -> `final`.

Adapters may refine provider-specific business response codes after JSON parsing.

- [ ] **Step 3: Defensive parse and sanitized errors.**

The helper accepts `unknown`, parser callbacks narrow it, and thrown messages must not include request headers, API keys, checksum keys, access keys, secret keys, raw signed payloads, or credential blobs.

- [ ] **Step 4: Treat timeout/network/invalid transient transport as retryable.**

Do not mutate payment financial status from this helper.

- [ ] **Step 5: Wire payOS first.**

MoMo can migrate onto the same helper in PR3. Do not rewrite unrelated provider behavior merely for consistency.

- [ ] **Step 6: Verify and commit.**

```bash
pnpm --filter=@booking/api lint
pnpm --filter=@booking/api typecheck

git add apps/api/src/modules/payments/infrastructure/gateways/provider-http.ts \
  apps/api/src/modules/payments/infrastructure/gateways/payos-gateway.adapter.ts
git commit -m "refactor(payments): bound provider http calls"
```

---

### Task 4: Remove tenant-controlled payOS base URL and harden payOS create/recovery

**Files:** contracts, registry, payOS adapter.

- [ ] **Step 1: Remove `baseUrl` from payOS credential schema/type in `packages/contracts/src/contracts/payment.ts`.**

Rebuild contracts before API typecheck:

```bash
pnpm --filter=@booking/contracts build
```

No dashboard/storefront code should be changed unless compile/search shows it explicitly references `baseUrl`.

- [ ] **Step 2: Remove `baseUrl` from `PayosCredentials` and `GatewayRegistry`.**

Use server-side constants only:

```ts
const PAYOS_API_BASE = 'https://api-merchant.payos.vn';
const PAYOS_CHECKOUT_BASE = 'https://pay.payos.vn/web';
```

Do not add a tenant or request override.

- [ ] **Step 3: Add lookup-before-create recovery by persisted numeric order code.**

For every `createPayment()` call:
1. validate/parse persisted `gatewayOrderRef` as a positive safe integer;
2. call `GET /v2/payment-requests/{orderCode}`;
3. if a payment link exists, normalize it as the same existing provider resource;
4. if provider reports not-found, POST `/v2/payment-requests` once;
5. if the POST transport times out, throw `GatewayRequestError('retryable', ...)` and leave local checkout `creating`; the next retry starts with GET and can recover the accepted resource.

The official GET response exposes the provider payment-link `id` and order status. Reconstruct the hosted checkout destination only with the fixed official checkout host:

```ts
{ type: 'redirect', paymentUrl: `${PAYOS_CHECKOUT_BASE}/${encodeURIComponent(paymentLinkId)}` }
```

Before returning a recovered handoff, validate `orderCode` and expected amount/status against the local create input. A conflicting amount/order result is a final provider integrity failure.

- [ ] **Step 4: Normalize create result.**

On create/recovery return:

```ts
{
  destination,
  gatewayTxnId: paymentLinkId,
  gatewayOrderRef: String(orderCode),
  paymentMethod: 'bank_transfer',
}
```

Preserve current contract-compatible method code if the stored provider method uses a different exact literal; do not invent a second customer method.

- [ ] **Step 5: Use constant-time signature equality.**

Normalize expected/actual hex Buffers and compare with `timingSafeEqual` only when lengths match. Invalid format returns `valid:false`; it never throws secrets.

- [ ] **Step 6: Verify tenant contract rejects `baseUrl`.**

Use a local API request against the gateway-config endpoint with a payOS payload containing `baseUrl`. Expected: validation rejects the unknown/removed field according to the existing Zod/object strictness contract. Also verify a normal payOS config still saves.

- [ ] **Step 7: Commit.**

```bash
git add packages/contracts/src/contracts/payment.ts \
  apps/api/src/modules/payments/infrastructure/gateway-registry.ts \
  apps/api/src/modules/payments/infrastructure/gateways/payos-gateway.adapter.ts
git commit -m "fix(payments): harden payos provider boundary"
```

---

### Task 5: Rewrite CheckoutUseCase into three short phases

**Primary file:** `checkout.use-case.ts` plus repository/registry signatures already prepared.

- [ ] **Step 1: Keep tenant/storefront/booking validation semantics unchanged.**

Resolve tenant and reject suspended storefront before Phase A. `storefrontOrigin()` validation stays intact.

- [ ] **Step 2: Phase A — short tenant transaction.**

Inside one `forTenant` callback:
1. load booking and determine deposit vs balance;
2. compute `{amount, kind}`;
3. read active configs, route requested customer method;
4. `resolveActiveForCheckout()` and get provider-normalized payment method;
5. validate gateway amount limits;
6. acquire `lockCheckoutAttempt()`;
7. re-read a reusable pending attempt;
8. if found, return that payment/attempt from Phase A;
9. otherwise generate UUID v7, call pure `gateway.prepareOrderReference(paymentId)`, and create `Payment` with `checkoutState='creating'`, stable `idempotencyKey`, revision ID, opaque pre-reference, amount/kind/method.

Do not call `createPayment()` in Phase A.

- [ ] **Step 3: Fast-path an existing ready handoff.**

If Phase A returned `checkoutState='ready'` with a valid destination, return it immediately without provider I/O.

- [ ] **Step 4: Resolve the adapter for the persisted payment in a separate short transaction.**

Use `resolveForPayment()` so a config rotation between Phase A and provider call cannot silently switch the checkout attempt to a different secret/revision.

- [ ] **Step 5: Phase B — call provider with no DB transaction open.**

Pass persisted `paymentId`, `gatewayOrderRef`, expected amount and URLs. For payOS the adapter's lookup-before-create logic makes timeout retries converge on one provider resource.

- [ ] **Step 6: Handle provider failures by classification.**

- retryable/network/timeout: leave `checkoutState='creating'`, propagate the existing normalized checkout failure; next request reuses the row;
- final/configuration create rejection: short transaction `markCheckoutCreateFailed()`; do not pretend payment succeeded;
- never expose provider secret/error body to customer response.

- [ ] **Step 7: Phase C — short transaction attach handoff.**

Call `markCheckoutReady()` and then re-read the payment if necessary. A concurrent webhook may already have marked financial status succeeded; attaching the handoff must not downgrade it.

Return:

```ts
{ paymentId: payment.id, destination: created.destination }
```

- [ ] **Step 8: Runtime concurrency/idempotency smoke with real DB.**

Exercise at minimum:
- double-click / two concurrent identical checkout requests;
- verify only one reusable local `Payment` attempt is created for same booking+kind+method;
- verify provider I/O happens after Phase A commit (observe DB row before delaying provider call if a controlled environment is available);
- simulate/reproduce a retryable provider failure and verify the same payment ID is reused;
- switch method (when multiple enabled methods are present) and verify a distinct legal attempt is allowed;
- rotate gateway config after Phase A and verify retry remains bound to original revision.

No permanent test file.

- [ ] **Step 9: Commit.**

```bash
git add apps/api/src/modules/payments/application/use-cases/checkout.use-case.ts \
  apps/api/src/modules/payments/domain/ports/payment-repository.port.ts \
  apps/api/src/modules/payments/infrastructure/repositories/prisma-payment.repository.ts
git commit -m "refactor(payments): make checkout durable"
```

---

### Task 6: Enforce exact captured amount for fixed provider checkout

**Files:** payment status/entity, webhook, reconciliation.

- [ ] **Step 1: Change the core amount predicate.**

```ts
export function amountMatches(expected: bigint, paid: bigint): boolean {
  return paid === expected;
}
```

Rename `assertAmountCovers` to `assertAmountMatches` if doing so keeps call sites clearer; update all uses in the same commit.

- [ ] **Step 2: Verified webhook mismatch must remain unsettled but acknowledged.**

For a valid signature + provider `succeeded` event with wrong amount:
- persist `capturedAmount` through `recordCapturedAmountIfPending()`;
- log a structured/text-searchable `payment_amount_mismatch` with payment ID, gateway, expected and captured amounts;
- do not call `markSucceeded()`;
- do not emit `payment.succeeded`;
- return normally so the provider does not retry a webhook that the application intentionally quarantined.

- [ ] **Step 3: Reconciliation uses the identical rule.**

If provider status is succeeded but amount differs:
- persist observed amount;
- log mismatch;
- leave payment pending;
- do not emit success.

Update stale log wording so it covers both underpayment and overpayment rather than only `< expected`.

- [ ] **Step 4: Add MoMo minimum checkout guard while touching gateway acceptance.**

Current docs/constants already state 1,000 VND minimum. Reject MoMo checkout `< 1_000n` as well as `> 50_000_000n`; use a named payment error consistent with current gateway-limit behavior. Do not expand card/ATM methods.

- [ ] **Step 5: Runtime smoke.**

Using a disposable local/provider payload path:
- exact amount -> success transition exactly once;
- underpayment -> pending + observed captured amount, no outbox success;
- overpayment -> same quarantine behavior;
- duplicate exact webhook after success -> no duplicate success event.

- [ ] **Step 6: Commit.**

```bash
git add apps/api/src/modules/payments/domain/payment-status.ts \
  apps/api/src/modules/payments/domain/entities/payment.entity.ts \
  apps/api/src/modules/payments/domain/gateway-limits.ts \
  apps/api/src/modules/payments/domain/errors/payment-errors.ts \
  apps/api/src/modules/payments/application/use-cases/handle-webhook.use-case.ts \
  apps/api/src/modules/payments/infrastructure/reconciliation.worker.ts
git commit -m "fix(payments): require exact captured amount"
```

---

### Task 7: payOS end-to-end local/channel smoke and PR2 completion

- [ ] **Step 1: Run provider smoke only with legitimate configured payOS credentials/channel.**

Verify:
1. new bank-transfer checkout creates a local `creating` row before provider handoff;
2. persisted payOS order ref is numeric, positive, safe-integer range;
3. create returns QR/payment link and local row becomes `ready`;
4. repeat checkout returns/reuses same local payment;
5. `GET /v2/payment-requests/{orderCode}` reconciliation works;
6. valid webhook finds payment by order code and records `paymentLinkId`;
7. invalid signature does not mutate payment;
8. amount mismatch remains pending;
9. expired/cancelled provider state follows existing guarded terminal rules.

If real payOS credentials are unavailable, explicitly record the provider scenarios as unverified; do not fake a green claim.

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

No MoMo refund-query logic, RefundBatch, storefront balance UI, card gateway, VNPay, or napas cleanup belongs in PR2.

- [ ] **Step 4: Create a draft PR after verification.**

Suggested title:

```text
refactor(payments): make checkout durable and harden payOS
```

PR description must record:
- DB transaction boundaries before/after;
- local concurrency/retry observations;
- payOS order-code algorithm and uniqueness protection;
- removal of tenant `baseUrl`;
- exact-amount behavior;
- provider smoke results or explicit credential limitation;
- exact static commands/outcomes.
