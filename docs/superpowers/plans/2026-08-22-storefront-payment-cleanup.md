# Storefront Payment State and Method Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make storefront payment state correctly distinguish balance-payment attempts from an already-confirmed booking, and stop creating new standalone `napas_qr` checkouts while preserving legacy contracts/data compatibility.

**Architecture:** Extend the normalized payment-status response with the latest payment kind, derive UI state from the actual attempt instead of booking status alone, and keep booking confirmation only as a fallback for non-balance initial payment flows. Deprecate `napas_qr` at new-checkout boundaries (public options, direct checkout, tenant settings UI) without removing the enum, SePay legacy provider code, or stored historical rows.

**Tech Stack:** `@booking/contracts` + Zod, NestJS 11, React Router 8 SSR, React 19, i18next, dashboard/storefront TypeScript.

**Spec:** `docs/superpowers/specs/2026-08-22-payment-core-hardening-design.md`

## Global Constraints

- ADR 0005 forbids automated tests. Do not add `*.test.*`, `*.spec.*`, e2e files, test runners, test scripts, or CI test steps.
- API response shape changes start in `@booking/contracts`, then DTO/use-case, then every frontend consumer.
- Frontends remain BFF-only; do not add browser-to-API fetches.
- `booking.status === 'confirmed'` must not imply the current balance payment attempt succeeded.
- Webhook/provider status remains payment source of truth; query-string return markers never mark success.
- Keep `napas_qr` in `customerPaymentMethodSchema` during this migration window so legacy payloads/settings/history remain parseable.
- Do not remove `NAPAS_BANK_TRANSFER` from SePay adapter/contracts in this PR.
- Do not add the future international-card provider in this PR.
- ZaloPay stays optional/dormant; no feature work beyond compatibility.
- New public `napas_qr` checkout must be rejected even if a caller bypasses the storefront UI.
- Existing historical payment rows/settings containing `napas_qr` remain readable.

## File Map

**Shared payment contract**
- Modify `packages/contracts/src/contracts/payment.ts` — add `paymentKind` to `PaymentStatusResponse`; define supported-new-checkout method policy while retaining legacy enum.

**API**
- Modify `apps/api/src/modules/payments/application/use-cases/get-payment-status.use-case.ts` — include latest payment kind.
- Modify `apps/api/src/modules/payments/infrastructure/http/dto/payments.dto.ts` — OpenAPI field.
- Modify `apps/api/src/modules/payments/application/use-cases/get-public-payment-options.use-case.ts` — filter deprecated standalone method.
- Modify `apps/api/src/modules/payments/application/use-cases/checkout.use-case.ts` — reject `napas_qr` for a new checkout.

**Storefront payment-state/UI**
- Modify `apps/storefront/app/features/booking/lib/booking-payment-state.ts` — balance-aware success/pending/polling.
- Modify `apps/storefront/app/features/booking/hooks/use-booking-detail-controller.ts` — expose `isBalancePayment` to view.
- Modify `apps/storefront/app/features/booking/components/booking-payment-view.tsx` — balance-specific pending/failed/success routing/copy.
- Modify `apps/storefront/app/features/booking/components/booking-success-view.tsx` — balance success copy without pretending a new booking was just created.
- Modify `apps/storefront/app/features/booking/server/booking-payment-status.server.ts` only if flow-cookie cleanup/retry behavior needs the new payment kind.
- Keep legacy `napas_qr` entry in `apps/storefront/app/features/checkout/hooks/use-checkout-form-controller.ts`; it becomes unreachable from new public options but remains a safe renderer for legacy data.

**Tenant dashboard**
- Modify `apps/dashboard/app/features/tenant/components/settings/payment-method-settings-card.tsx` — hide/remove `napas_qr` from selectable new methods.

**Copy**
- Modify `packages/i18n/src/locales/vi/booking.ts`.
- Modify `packages/i18n/src/locales/en/booking.ts`.
- Modify checkout locale files only if removing obsolete standalone Napas customer-facing labels does not break the typed namespace; otherwise retain legacy keys for compatibility.

---

### Task 1: Extend payment-status contract with latest payment kind

**Files:**
- Modify: `packages/contracts/src/contracts/payment.ts`
- Modify: `apps/api/src/modules/payments/application/use-cases/get-payment-status.use-case.ts`
- Modify: `apps/api/src/modules/payments/infrastructure/http/dto/payments.dto.ts`

**Produces:**

```ts
export const paymentStatusResponseSchema = z.object({
  bookingCode: z.string(),
  bookingStatus: z.string(),
  paymentStatus: z.enum(['none', 'pending', 'succeeded', 'failed', 'expired']),
  paymentKind: paymentKindSchema.nullable(),
  paidAmount: z.string(),
});
```

`GetPaymentStatusUseCase` returns:

```ts
return {
  bookingCode: code,
  bookingStatus: booking.status,
  paymentStatus: publicPaymentStatus(payment?.status ?? null),
  paymentKind: payment?.kind ?? null,
  paidAmount: booking.paidAmount.toString(),
};
```

The latest payment row remains the relevant attempt because checkout creates/reuses the active attempt and status polling is attempt-oriented. Do not infer kind from booking amounts in the frontend.

- [ ] **Step 1: Move/declare `paymentKindSchema` before `paymentStatusResponseSchema` if necessary so the schema can reuse it without duplication.**
- [ ] **Step 2: Add `paymentKind: paymentKindSchema.nullable()` to the response schema.** This is an additive wire change.
- [ ] **Step 3: Return latest `payment.kind` from `GetPaymentStatusUseCase`.**
- [ ] **Step 4: Add the OpenAPI DTO property with nullable enum values `deposit | balance | full | security_deposit`.**
- [ ] **Step 5: Rebuild contracts, then typecheck API/storefront.**

```bash
pnpm --filter=@booking/contracts build
pnpm --filter=@booking/api typecheck
pnpm --filter=@booking/storefront typecheck
```

- [ ] **Step 6: Commit.**

```bash
git add packages/contracts/src/contracts/payment.ts \
  apps/api/src/modules/payments/application/use-cases/get-payment-status.use-case.ts \
  apps/api/src/modules/payments/infrastructure/http/dto/payments.dto.ts
git commit -m "feat(payments): expose latest payment kind"
```

---

### Task 2: Make payment-state derivation balance-aware

**Files:**
- Modify: `apps/storefront/app/features/booking/lib/booking-payment-state.ts`
- Modify: `apps/storefront/app/features/booking/hooks/use-booking-detail-controller.ts`

**Produces:**

```ts
export interface BookingPaymentState {
  bookingStatus: BookingStatus | null;
  isBalancePayment: boolean;
  paymentFailed: boolean;
  isSuccess: boolean;
  isPending: boolean;
  shouldPoll: boolean;
}
```

Use these exact rules:

```ts
const isBalancePayment = status.paymentKind === 'balance';
const providerSucceeded = status.paymentStatus === 'succeeded';
const bookingSucceeded = bookingStatus !== null && SUCCESS.has(bookingStatus);

const isSuccess = providerSucceeded || (!isBalancePayment && bookingSucceeded);

const serverFailed =
  status.paymentStatus === 'failed' ||
  status.paymentStatus === 'expired' ||
  bookingStatus === 'expired' ||
  bookingStatus === 'rejected';

const paymentFailed = !isSuccess && (serverFailed || redirectFailed);

const isBalancePending = isBalancePayment && status.paymentStatus === 'pending';
const initialPending =
  !isBalancePayment && bookingStatus !== null && PENDING.has(bookingStatus);

const isPending = !paymentFailed && !isSuccess && (isBalancePending || initialPending);
const shouldPoll =
  !isSuccess && !serverFailed && (isBalancePending || initialPending);
```

Important edge cases:
- confirmed booking + latest balance pending -> pending, poll;
- confirmed booking + latest balance failed -> failed, not success;
- confirmed booking + latest balance succeeded -> success;
- confirmed booking + latest deposit/full succeeded -> success;
- confirmed booking with no payment kind (legacy state) -> retain booking-confirmed fallback;
- query `?payment=success` never affects `isSuccess`; it only remains informational navigation state.

- [ ] **Step 1: Implement the exact rules above in `deriveBookingPaymentState()`.**
- [ ] **Step 2: Return `isBalancePayment`.**
- [ ] **Step 3: Thread the flag through `useBookingDetailController().viewProps`.**
- [ ] **Step 4: Verify TypeScript.**

```bash
pnpm --filter=@booking/storefront lint
pnpm --filter=@booking/storefront typecheck
```

- [ ] **Step 5: Commit.**

```bash
git add apps/storefront/app/features/booking/lib/booking-payment-state.ts \
  apps/storefront/app/features/booking/hooks/use-booking-detail-controller.ts
git commit -m "fix(storefront): derive balance payment state from attempt"
```

---

### Task 3: Render balance-specific payment outcome copy

**Files:**
- Modify: `apps/storefront/app/features/booking/components/booking-payment-view.tsx`
- Modify: `apps/storefront/app/features/booking/components/booking-success-view.tsx`
- Modify: `packages/i18n/src/locales/vi/booking.ts`
- Modify: `packages/i18n/src/locales/en/booking.ts`

**New booking i18n keys:**

Vietnamese:

```ts
payment: {
  // existing keys...
  balanceTitle: 'Thanh toán số tiền còn lại',
  balanceChecking: 'Đang kiểm tra trạng thái thanh toán số tiền còn lại…',
  balanceSucceeded: 'Đã thanh toán số tiền còn lại',
  balanceSucceededNote: 'Khoản thanh toán đã được xác nhận cho đặt chỗ này.',
  balanceFailedTitle: 'Thanh toán số tiền còn lại chưa hoàn tất',
  balanceFailedNote: 'Khoản thanh toán chưa được xác nhận. Bạn có thể thử lại từ chi tiết đặt chỗ.',
}
```

English:

```ts
payment: {
  // existing keys...
  balanceTitle: 'Pay remaining balance',
  balanceChecking: 'Checking the remaining-balance payment status…',
  balanceSucceeded: 'Remaining balance paid',
  balanceSucceededNote: 'The payment has been confirmed for this booking.',
  balanceFailedTitle: 'Remaining balance payment not completed',
  balanceFailedNote: 'The payment has not been confirmed. You can retry from the booking details.',
}
```

- [ ] **Step 1: Add `isBalancePayment` to `BookingPaymentViewProps`.**
- [ ] **Step 2: Pending/failed title and description choose the balance keys when `isBalancePayment=true`.** The current generic initial-booking copy remains unchanged otherwise.
- [ ] **Step 3: Pass `isBalancePayment` to `BookingSuccessView`.**
- [ ] **Step 4: For desktop/mobile success heading, use `payment.balanceSucceeded` / `payment.balanceSucceededNote` for a balance attempt rather than `success.title` / `success.thanks`.** Keep booking code/details/actions intact.
- [ ] **Step 5: Do not send a second “booking created” semantic message for balance success.** Existing booking details remain visible because the booking already existed/was confirmed.
- [ ] **Step 6: Verify locale typing and frontend checks.**

```bash
pnpm --filter=@booking/contracts build
pnpm --filter=@booking/i18n typecheck || true
pnpm --filter=@booking/storefront lint
pnpm --filter=@booking/storefront typecheck
pnpm --filter=@booking/storefront build
```

If `@booking/i18n` has no standalone `typecheck` script, the storefront typecheck/build is the authoritative consumer check; do not add a new script solely for this PR.

- [ ] **Step 7: Commit.**

```bash
git add apps/storefront/app/features/booking/components/booking-payment-view.tsx \
  apps/storefront/app/features/booking/components/booking-success-view.tsx \
  packages/i18n/src/locales/vi/booking.ts packages/i18n/src/locales/en/booking.ts
git commit -m "fix(storefront): show balance payment outcome accurately"
```

---

### Task 4: Preserve polling/flow cleanup semantics for balance attempts

**Files:**
- Modify only if required: `apps/storefront/app/features/booking/server/booking-payment-status.server.ts`

**Required behavior:**
- polling does not stop merely because `bookingStatus === 'confirmed'` when `paymentKind === 'balance'` and payment status is pending;
- flow cookie is destroyed only when `status.paymentStatus === 'succeeded'`, as today;
- do not destroy flow on `?payment=success` return marker;
- `canRetry` may remain false for account-originated balance attempts with no public checkout-flow cookie; account booking detail remains the retry entry point.

- [ ] **Step 1: Verify the existing server loader already satisfies cookie cleanup (`paymentStatus === 'succeeded'`).** If no code change is necessary, leave the file untouched.
- [ ] **Step 2: If `canRetry` logic accidentally treats confirmed balance as a successful retry state after Task 2, keep `canRetry` independent from `isSuccess`; do not manufacture a new public access grant.**
- [ ] **Step 3: Run storefront typecheck/build.**

```bash
pnpm --filter=@booking/storefront typecheck
pnpm --filter=@booking/storefront build
```

No commit is required if this task confirms no source change.

---

### Task 5: Define a new-checkout method policy while keeping the legacy enum

**Files:**
- Modify: `packages/contracts/src/contracts/payment.ts`

**Produces:**

```ts
export const NEW_CHECKOUT_PAYMENT_METHODS = [
  'bank_transfer',
  'international_card',
  'momo_wallet',
  'zalopay_wallet',
] as const satisfies readonly CustomerPaymentMethod[];

export function isNewCheckoutPaymentMethod(
  method: CustomerPaymentMethod,
): boolean {
  return (NEW_CHECKOUT_PAYMENT_METHODS as readonly string[]).includes(method);
}
```

Do **not** remove:

```ts
'napas_qr'
```

from `customerPaymentMethodSchema`, and do not remove SePay `NAPAS_BANK_TRANSFER` provider code.

- [ ] **Step 1: Add the constant/helper adjacent to customer payment method definitions.**
- [ ] **Step 2: Document in code that `napas_qr` is parseable legacy data but unavailable for newly-created checkout.**
- [ ] **Step 3: Rebuild contracts.**

```bash
pnpm --filter=@booking/contracts build
```

Do not commit alone; Task 6 consumes the policy in the same compile-safe change.

---

### Task 6: Stop offering or accepting new standalone `napas_qr` checkout

**Files:**
- Modify: `apps/api/src/modules/payments/application/use-cases/get-public-payment-options.use-case.ts`
- Modify: `apps/api/src/modules/payments/application/use-cases/checkout.use-case.ts`
- Modify: `apps/dashboard/app/features/tenant/components/settings/payment-method-settings-card.tsx`
- Keep unchanged unless compatibility compile requires it: `apps/storefront/app/features/checkout/hooks/use-checkout-form-controller.ts`

**Public options:**

Change the method filter to require both routing support and new-checkout eligibility:

```ts
const methods = customerPaymentMethodSchema.options.filter(
  (method) => isNewCheckoutPaymentMethod(method) && pickConfigForMethod(configs, method) !== null,
);
```

**Direct API guard:**

At the start of the new checkout application flow, before provider work:

```ts
if (!isNewCheckoutPaymentMethod(paymentMethod)) {
  throw new PaymentMethodUnavailable();
}
```

This prevents a client from manually POSTing `napas_qr` despite it being hidden from options.

**Dashboard:**

Remove the standalone Napas entry from the selectable `METHODS` array. Do not change stored schema validation; a historical settings JSON containing `napas_qr` must still parse. On the next admin save, hidden legacy `napas_qr` naturally drops out of `enabledMethods` because the form no longer posts it.

Storefront `PAYMENT_METHODS.napas_qr` may stay as a compatibility renderer. Since `/public/payment-options` no longer emits it, new customers never see it.

- [ ] **Step 1: Consume `isNewCheckoutPaymentMethod` in public options.**
- [ ] **Step 2: Add the direct checkout guard.**
- [ ] **Step 3: Remove the dashboard selectable Napas row and its now-unused UI icon import if applicable.**
- [ ] **Step 4: Verify legacy parsing by building contracts/API/dashboard/storefront.**

```bash
pnpm --filter=@booking/contracts build
pnpm --filter=@booking/api lint
pnpm --filter=@booking/api typecheck
pnpm --filter=@booking/dashboard lint
pnpm --filter=@booking/dashboard typecheck
pnpm --filter=@booking/storefront lint
pnpm --filter=@booking/storefront typecheck
```

- [ ] **Step 5: Commit Tasks 5-6 together.**

```bash
git add packages/contracts/src/contracts/payment.ts \
  apps/api/src/modules/payments/application/use-cases/get-public-payment-options.use-case.ts \
  apps/api/src/modules/payments/application/use-cases/checkout.use-case.ts \
  apps/dashboard/app/features/tenant/components/settings/payment-method-settings-card.tsx
git commit -m "refactor(payments): retire standalone napas checkout"
```

---

### Task 7: Remove obsolete conditional paths only where reachability is proven

**Files:**
- Inspect: `apps/storefront/app/features/checkout/hooks/use-checkout-form-controller.ts`
- Inspect: `packages/i18n/src/locales/vi/checkout.ts`
- Inspect: `packages/i18n/src/locales/en/checkout.ts`
- Inspect: `apps/api/src/modules/payments/infrastructure/gateways/sepay-gateway.adapter.ts`

**Rules:**
- Do not remove legacy parser/provider branches solely because new UI no longer offers them.
- Keep `PAYMENT_METHODS.napas_qr` if `CustomerPaymentMethod` remains a total `Record` keyed by the enum; deleting it would make the renderer non-total/type-invalid.
- Keep SePay `napas_qr -> NAPAS_BANK_TRANSFER` mapping until the legacy enum is removed in a later coordinated cleanup.
- Keep typed i18n `payment.domesticCard` key if the compatibility map references it.
- Remove only imports/branches that are genuinely unreachable after the above rules and whose removal preserves total typing.

- [ ] **Step 1: Run code search for `napas_qr`, `NAPAS_BANK_TRANSFER`, and `payment.domesticCard`.**
- [ ] **Step 2: Categorize every occurrence as `legacy-parse`, `provider-compat`, `new-checkout`, or `UI-copy`.**
- [ ] **Step 3: Delete only remaining `new-checkout` occurrences.** The expected retained core occurrences are the legacy enum/schema, compatibility renderer, and SePay provider mapping.
- [ ] **Step 4: Verify full frontend/API typechecks.**

```bash
pnpm --filter=@booking/contracts build
pnpm --filter=@booking/api typecheck
pnpm --filter=@booking/storefront typecheck
pnpm --filter=@booking/dashboard typecheck
```

- [ ] **Step 5: Commit only if source actually changed.**

```bash
git add packages/i18n apps/storefront apps/api/src/modules/payments/infrastructure/gateways

git commit -m "chore(payments): clean deprecated payment method paths"
```

Skip the commit if inspection proves all remaining occurrences are required compatibility code.

---

### Task 8: Runtime smoke payment-state and method visibility

**Files:** no committed test files.

- [ ] **Step 1: Run the full repository static gate.**

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

- [ ] **Step 2: Start local apps against seeded infrastructure.**

```bash
docker compose up -d
pnpm --filter=@booking/api prisma:deploy
pnpm --filter=@booking/api seed
pnpm dev
```

- [ ] **Step 3: Smoke initial payment success.** Start a normal pending-payment booking, complete the payment, confirm the existing booking-success screen still appears and polling stops after provider/webhook success.

- [ ] **Step 4: Smoke balance pending on confirmed booking.** Use a confirmed deposit booking with outstanding balance, start balance checkout, return to `/bookings/:code` before webhook success. Confirm the page shows balance-payment pending/checking and continues polling; it must not show booking/payment success merely because booking status is confirmed.

- [ ] **Step 5: Smoke balance failure.** Mark/return the balance payment failed/expired. Confirm balance-specific failure copy is shown, never success.

- [ ] **Step 6: Smoke balance success.** Complete the balance payment/webhook. Confirm the page switches to `Remaining balance paid` / Vietnamese equivalent and displays the existing booking details without pretending a new booking was created.

- [ ] **Step 7: Smoke payment options.** Configure legacy SePay settings containing `napas_qr`. Confirm `/public/payment-options` does not return `napas_qr`; checkout UI does not render it; dashboard no longer offers it as a selectable method; historical config still loads without schema failure.

- [ ] **Step 8: Smoke direct API rejection.** POST a valid accessible checkout request with `paymentMethod: 'napas_qr'` and confirm the established `PAYMENT_METHOD_UNAVAILABLE` error is returned with no new payment/provider call.

- [ ] **Step 9: Confirm legacy rows remain readable.** Open payment history containing legacy Napas/provider method data and verify no contract/parser failure.

## Definition of Done

- `PaymentStatusResponse` identifies the latest payment kind.
- Confirmed booking + pending/failed balance attempt is never rendered as success.
- Balance pending continues polling until provider truth changes.
- Balance success uses balance-specific copy.
- Initial booking payment success remains backward-compatible.
- `napas_qr` remains parseable for legacy data but is absent from new public payment options.
- Direct new `napas_qr` checkout is rejected.
- Tenant settings UI no longer offers standalone Napas.
- SePay legacy Napas mapping and stored records remain readable during the migration window.
- No international-card provider or unrelated payment feature is added.
- Full static gate and local runtime smoke pass with zero automated test artifacts.