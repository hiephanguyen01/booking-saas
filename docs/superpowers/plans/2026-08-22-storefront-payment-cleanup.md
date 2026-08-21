# Storefront Payment State and Method Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make storefront payment state correctly distinguish balance-payment attempts from an already-confirmed booking, and stop creating new standalone `napas_qr` checkouts while preserving legacy data/contracts.

**Architecture:** Extend normalized payment status with latest payment kind, derive UI state from the current attempt instead of booking status alone, and keep booking-confirmed fallback only for non-balance flows. Deprecate `napas_qr` at public options/direct checkout/settings boundaries without removing the legacy enum, stored values, or SePay provider mapping.

**Tech Stack:** `@booking/contracts` + Zod, NestJS 11, React Router 8 SSR, React 19, i18next, dashboard/storefront TypeScript.

**Spec:** `docs/superpowers/specs/2026-08-22-payment-core-hardening-design.md`

## Global Constraints

- ADR 0005 forbids automated tests. Do not add test files/runners/scripts/CI test steps.
- API response changes start in `@booking/contracts`, then API DTO/use-case, then frontend consumers.
- Frontends remain BFF-only.
- `booking.status === 'confirmed'` must not imply the current balance payment succeeded.
- Query-string return markers never create payment success; provider/webhook state remains truth.
- Keep `napas_qr` in `customerPaymentMethodSchema` during migration so legacy rows/settings parse.
- Keep SePay `NAPAS_BANK_TRANSFER` compatibility mapping in this PR.
- Do not add the future international-card provider.
- New direct/public `napas_qr` checkout must be rejected even when a client bypasses the UI.

## File Map

**Contracts/API**
- Modify `packages/contracts/src/contracts/payment.ts`.
- Modify `apps/api/src/modules/payments/application/use-cases/get-payment-status.use-case.ts`.
- Modify `apps/api/src/modules/payments/infrastructure/http/dto/payments.dto.ts`.
- Modify `apps/api/src/modules/payments/application/use-cases/get-public-payment-options.use-case.ts`.
- Modify `apps/api/src/modules/payments/application/use-cases/checkout.use-case.ts`.

**Storefront**
- Modify `apps/storefront/app/features/booking/lib/booking-payment-state.ts`.
- Modify `apps/storefront/app/features/booking/hooks/use-booking-detail-controller.ts`.
- Modify `apps/storefront/app/features/booking/components/booking-payment-view.tsx`.
- Modify `apps/storefront/app/features/booking/components/booking-success-view.tsx`.
- Inspect `apps/storefront/app/features/booking/server/booking-payment-status.server.ts`; change only if required by the exact rules below.
- Keep legacy renderer coverage in `apps/storefront/app/features/checkout/hooks/use-checkout-form-controller.ts` unless total typing permits removal later.

**Dashboard/copy**
- Modify `apps/dashboard/app/features/tenant/components/settings/payment-method-settings-card.tsx`.
- Modify `packages/i18n/src/locales/vi/booking.ts`.
- Modify `packages/i18n/src/locales/en/booking.ts`.

---

### Task 1: Expose latest payment kind in payment-status response

**Files:** contract, API use case, DTO.

Use the existing `paymentKindSchema` in the response:

```ts
export const paymentStatusResponseSchema = z.object({
  bookingCode: z.string(),
  bookingStatus: z.string(),
  paymentStatus: z.enum(['none', 'pending', 'succeeded', 'failed', 'expired']),
  paymentKind: paymentKindSchema.nullable(),
  paidAmount: z.string(),
});
```

If `paymentKindSchema` is declared later in the file, move that declaration above `paymentStatusResponseSchema`; do not duplicate the enum.

API return:

```ts
return {
  bookingCode: code,
  bookingStatus: booking.status,
  paymentStatus: publicPaymentStatus(payment?.status ?? null),
  paymentKind: payment?.kind ?? null,
  paidAmount: booking.paidAmount.toString(),
};
```

- [ ] Add the contract field and DTO property (`deposit | balance | full | security_deposit | null`).
- [ ] Return `payment.kind` from `GetPaymentStatusUseCase`.
- [ ] Rebuild/typecheck:

```bash
pnpm --filter=@booking/contracts build
pnpm --filter=@booking/api typecheck
pnpm --filter=@booking/storefront typecheck
```

- [ ] Commit:

```bash
git add packages/contracts/src/contracts/payment.ts \
  apps/api/src/modules/payments/application/use-cases/get-payment-status.use-case.ts \
  apps/api/src/modules/payments/infrastructure/http/dto/payments.dto.ts
git commit -m "feat(payments): expose latest payment kind"
```

---

### Task 2: Derive balance-payment state from the current attempt

**Files:** `booking-payment-state.ts`, `use-booking-detail-controller.ts`.

Extend state:

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

Implement these exact rules:

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

Required cases:
- confirmed + balance pending -> pending + poll;
- confirmed + balance failed/expired -> failed, never success;
- confirmed + balance succeeded -> success;
- confirmed + deposit/full succeeded -> success;
- `paymentKind=null` legacy confirmed state retains old booking-status fallback;
- `?payment=success` never affects `isSuccess`.

- [ ] Implement exact derivation and return `isBalancePayment`.
- [ ] Thread it through controller `viewProps`.
- [ ] Verify:

```bash
pnpm --filter=@booking/storefront lint
pnpm --filter=@booking/storefront typecheck
```

- [ ] Commit:

```bash
git add apps/storefront/app/features/booking/lib/booking-payment-state.ts \
  apps/storefront/app/features/booking/hooks/use-booking-detail-controller.ts
git commit -m "fix(storefront): derive balance payment state from attempt"
```

---

### Task 3: Render balance-specific outcome copy

**Files:** payment view, success view, VI/EN booking locales.

Add keys.

Vietnamese:

```ts
balanceTitle: 'Thanh toán số tiền còn lại',
balanceChecking: 'Đang kiểm tra trạng thái thanh toán số tiền còn lại…',
balanceSucceeded: 'Đã thanh toán số tiền còn lại',
balanceSucceededNote: 'Khoản thanh toán đã được xác nhận cho đặt chỗ này.',
balanceFailedTitle: 'Thanh toán số tiền còn lại chưa hoàn tất',
balanceFailedNote: 'Khoản thanh toán chưa được xác nhận. Bạn có thể thử lại từ chi tiết đặt chỗ.',
```

English:

```ts
balanceTitle: 'Pay remaining balance',
balanceChecking: 'Checking the remaining-balance payment status…',
balanceSucceeded: 'Remaining balance paid',
balanceSucceededNote: 'The payment has been confirmed for this booking.',
balanceFailedTitle: 'Remaining balance payment not completed',
balanceFailedNote: 'The payment has not been confirmed. You can retry from the booking details.',
```

- [ ] Add `isBalancePayment` prop to `BookingPaymentView` and `BookingSuccessView`.
- [ ] Pending/failed heading/description select balance keys when true.
- [ ] Desktop and mobile success heading use balance success keys instead of “booking created/success” copy when true.
- [ ] Keep booking code/details/actions; do not send another “new booking” semantic message.
- [ ] Verify using real consumer checks only:

```bash
pnpm --filter=@booking/contracts build
pnpm --filter=@booking/storefront lint
pnpm --filter=@booking/storefront typecheck
pnpm --filter=@booking/storefront build
```

- [ ] Commit:

```bash
git add apps/storefront/app/features/booking/components/booking-payment-view.tsx \
  apps/storefront/app/features/booking/components/booking-success-view.tsx \
  packages/i18n/src/locales/vi/booking.ts packages/i18n/src/locales/en/booking.ts
git commit -m "fix(storefront): show balance payment outcome accurately"
```

---

### Task 4: Preserve polling/cookie semantics for balance attempts

**File to inspect:** `booking-payment-status.server.ts`.

The current loader already destroys checkout-flow cookie only when `status.paymentStatus === 'succeeded'`; preserve that. Required behavior:
- pending balance continues polling because Task 2 returns `shouldPoll=true` even while booking is confirmed;
- no cookie destruction on return query marker;
- account-originated balance attempts may keep `canRetry=false` when there is no public checkout-flow cookie; account booking detail remains the retry entry point;
- do not manufacture a new access grant or checkout-flow record.

- [ ] Inspect the loader after Tasks 1-3.
- [ ] If current logic already satisfies all four rules, leave the file unchanged.
- [ ] If a change is necessary, limit it to those rules.
- [ ] Verify:

```bash
pnpm --filter=@booking/storefront typecheck
pnpm --filter=@booking/storefront build
```

---

### Task 5: Define new-checkout eligibility while retaining legacy enum values

**File:** `packages/contracts/src/contracts/payment.ts`.

Add:

```ts
export const NEW_CHECKOUT_PAYMENT_METHODS = [
  'bank_transfer',
  'international_card',
  'momo_wallet',
  'zalopay_wallet',
] as const satisfies readonly CustomerPaymentMethod[];

export function isNewCheckoutPaymentMethod(method: CustomerPaymentMethod): boolean {
  return (NEW_CHECKOUT_PAYMENT_METHODS as readonly string[]).includes(method);
}
```

Document that `napas_qr` remains parseable legacy data but is unavailable for newly-created checkout.

Do not remove `napas_qr` from `customerPaymentMethodSchema`; do not remove `NAPAS_BANK_TRANSFER`.

- [ ] Add constant/helper and rebuild contracts:

```bash
pnpm --filter=@booking/contracts build
```

Do not commit yet; Task 6 consumes it so the branch stays coherent.

---

### Task 6: Stop offering and accepting standalone `napas_qr`

**Files:** public options use case, checkout use case, dashboard settings card.

Public options:

```ts
const methods = customerPaymentMethodSchema.options.filter(
  (method) => isNewCheckoutPaymentMethod(method) && pickConfigForMethod(configs, method) !== null,
);
```

Direct checkout guard, before provider work:

```ts
if (!isNewCheckoutPaymentMethod(paymentMethod)) {
  throw new PaymentMethodUnavailable();
}
```

Dashboard:
- remove `napas_qr` from selectable `METHODS` array;
- remove now-unused icon import if applicable;
- keep persisted schema validation unchanged, so historical settings with `napas_qr` still parse;
- next admin save naturally drops the hidden legacy value from posted `enabledMethods`.

Storefront compatibility map may keep `napas_qr`; new public options make it unreachable for new checkouts.

- [ ] Implement API filtering/guard and dashboard removal.
- [ ] Verify:

```bash
pnpm --filter=@booking/contracts build
pnpm --filter=@booking/api lint
pnpm --filter=@booking/api typecheck
pnpm --filter=@booking/dashboard lint
pnpm --filter=@booking/dashboard typecheck
pnpm --filter=@booking/storefront lint
pnpm --filter=@booking/storefront typecheck
```

- [ ] Commit Tasks 5-6:

```bash
git add packages/contracts/src/contracts/payment.ts \
  apps/api/src/modules/payments/application/use-cases/get-public-payment-options.use-case.ts \
  apps/api/src/modules/payments/application/use-cases/checkout.use-case.ts \
  apps/dashboard/app/features/tenant/components/settings/payment-method-settings-card.tsx
git commit -m "refactor(payments): retire standalone napas checkout"
```

---

### Task 7: Prove remaining Napas references are compatibility-only

**Inspect:** checkout renderer, VI/EN checkout locales, SePay adapter, contracts.

- [ ] Search for `napas_qr`, `NAPAS_BANK_TRANSFER`, and `payment.domesticCard`.
- [ ] Classify each occurrence as one of: legacy parser, provider compatibility, new checkout, customer UI copy.
- [ ] Delete only remaining **new-checkout** occurrences.
- [ ] Expected retained core occurrences: legacy enum/schema, total compatibility renderer if its `Record<CustomerPaymentMethod,...>` requires it, and SePay provider mapping.
- [ ] Verify:

```bash
pnpm --filter=@booking/contracts build
pnpm --filter=@booking/api typecheck
pnpm --filter=@booking/storefront typecheck
pnpm --filter=@booking/dashboard typecheck
```

- [ ] Commit only if this inspection produces real source changes.

---

### Task 8: Runtime smoke payment state and method visibility

**No committed test files.**

- [ ] Full static gate:

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

- [ ] Start local infra/apps and seed.
- [ ] Initial payment success still shows existing booking-success behavior.
- [ ] Confirmed booking + balance pending shows balance pending and keeps polling.
- [ ] Balance failed/expired shows balance-specific failure, never success.
- [ ] Balance succeeded shows balance-specific success without “new booking” copy.
- [ ] Configure historical SePay settings containing `napas_qr`: public options omit it; dashboard does not offer it; historical config still loads.
- [ ] Direct accessible POST with `paymentMethod:'napas_qr'` returns established `PAYMENT_METHOD_UNAVAILABLE` and creates no payment/provider call.
- [ ] Legacy payment history/provider rows containing Napas remain readable.

## Definition of Done

- Payment status exposes latest payment kind.
- Confirmed booking + pending/failed balance attempt is never rendered as success.
- Balance pending continues polling until provider truth changes.
- Balance success uses balance-specific copy.
- Initial booking payment success remains backward-compatible.
- `napas_qr` remains parseable legacy data but is absent from new public options/settings and rejected for direct new checkout.
- SePay legacy Napas mapping/stored rows remain readable.
- No international-card provider or unrelated payment feature is added.
- Full static gate and local runtime smoke pass with zero automated test artifacts.