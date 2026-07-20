# Storefront Booking Detail Figma Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the customer storefront booking-detail route faithfully match all seven supplied Figma states while rendering only API-derived booking and settlement values.

**Architecture:** Keep the existing React Router loader/action as the server boundary and retain one state-driven page. Split the current oversized presentation into a thin orchestrator plus focused overview, financial, and review components; all state selection continues to flow from `AccountBookingViewModel` and `CustomerBookingSettlementResponse`.

**Tech Stack:** React 19, React Router 8 SSR, TypeScript, Tailwind CSS 4, shadcn/Radix UI, Lucide React, `@booking/contracts`, `@booking/i18n`.

## Global Constraints

- Implement only storefront `/account/bookings/:code`; do not modify tenant or partner dashboard booking details.
- Never fetch the API from the browser; data and mutations stay in React Router loaders/actions.
- Money remains bigint VND strings and is formatted through `formatCurrency`.
- All booking-specific values come from API responses or frozen booking snapshots; never substitute Figma sample data.
- Preserve Vietnamese and English locales, semantic markup, keyboard focus, and responsive behavior.
- Do not create tests or test configuration. Verification is lint, typecheck, build, and manual running-app comparison.

---

### Task 1: Define the state-driven booking-detail presentation contract

**Files:**
- Modify: `apps/storefront/app/features/account/lib/booking-history.ts`
- Modify: `apps/storefront/app/features/account/components/booking-status-badge.tsx`

**Interfaces:**
- Consumes: `BookingStatus`, `AccountBookingViewModel.variant`.
- Produces: `BookingDetailState` and `bookingDetailState(status)` for all shared components.

- [ ] **Step 1: Add an explicit Figma-state type and total status mapping**

```ts
export type BookingDetailState =
  | 'need-payment'
  | 'coming-soon'
  | 'done'
  | 'absent'
  | 'cancelled';

const DETAIL_STATES: Record<BookingStatus, BookingDetailState> = {
  draft: 'need-payment',
  pending_payment: 'need-payment',
  pending_approval: 'coming-soon',
  confirmed: 'coming-soon',
  completed: 'done',
  no_show: 'absent',
  cancelled: 'cancelled',
  rejected: 'cancelled',
  expired: 'cancelled',
  refunded: 'cancelled',
};

export function bookingDetailState(status: BookingStatus): BookingDetailState {
  return DETAIL_STATES[status];
}
```

- [ ] **Step 2: Align status badges with the Figma status pills**

Keep the translated API status label, use a compact uppercase pill, and assign the Figma semantic
palette: orange for payment, blue for upcoming, green for done, red for absent/cancelled, violet for
refunded, and neutral for draft/expired.

- [ ] **Step 3: Verify the contract compiles**

Run: `pnpm --filter=@booking/storefront typecheck`

Expected: React Router type generation and TypeScript complete with exit code 0.

### Task 2: Rebuild the shared Figma booking card and page composition

**Files:**
- Modify: `apps/storefront/app/features/account/components/booking-detail-panel.tsx`
- Create: `apps/storefront/app/features/account/components/booking-detail-overview.tsx`

**Interfaces:**
- Consumes: `AccountBookingViewModel`, `BookingDetailState`, `Locale`, cancel/payment/dispute actions.
- Produces: `BookingDetailOverview` with the shared studio header, listing body, dynamic attributes,
  policy strip, and state-specific primary action.

- [ ] **Step 1: Make `BookingDetailPanel` a thin page orchestrator**

```tsx
const state = bookingDetailState(booking.status);

return (
  <div className="mx-auto w-full max-w-[870px]">
    <BookingDetailPageHeading locale={locale} />
    <div className="mt-5 space-y-5">
      <BookingDetailOverview
        booking={booking}
        locale={locale}
        state={state}
        defaultCancelOpen={defaultCancelOpen}
        actionError={actionError}
      />
      {state === 'done' ? <BookingReviewSection booking={booking} /> : null}
      <BookingContactSection booking={booking} />
      <BookingFinancialSection booking={booking} locale={locale} settlement={settlement} />
      <PaymentTaxNote />
    </div>
  </div>
);
```

The page heading uses the Figma title `bookings.detailTitle` and a compact back control without
duplicating the account-shell navigation title.

- [ ] **Step 2: Implement the shared overview structure from the Figma frames**

`BookingDetailOverview` renders:

```tsx
<section className="overflow-hidden border border-[#e7e7e7] bg-white">
  <BookingStudioHeader />
  <BookingListingSummary />
  {booking.attributes.length > 0 ? <BookingAttributes /> : null}
  <BookingPolicyActions />
</section>
```

Use the Figma desktop proportions (870px content width, 24px horizontal section padding, 16px
section rhythm, subtle 1px separators), with mobile grids collapsing to one column. The listing
summary includes image/fallback, title, resource, date, time, duration, description, booking mode,
and quantity/guest count. Render arbitrary API attributes by mapping the full array.

- [ ] **Step 3: Render actions only when valid for the API state**

```tsx
const canPay = booking.status === 'pending_payment';
const canCancel = booking.status === 'confirmed';
const canDispute = state === 'absent';
```

Pay submits `intent=pay`, cancel opens `CancelBookingDialog`, dispute links to the account help
route, and chat links to account messages. No disabled or fake action is shown for unsupported
states.

- [ ] **Step 4: Verify the shared card**

Run: `pnpm --filter=@booking/storefront lint && pnpm --filter=@booking/storefront typecheck`

Expected: both commands exit 0.

### Task 3: Match the review, contact, and financial variants

**Files:**
- Create: `apps/storefront/app/features/account/components/booking-detail-sections.tsx`
- Modify: `apps/storefront/app/features/account/components/booking-detail-panel.tsx`
- Modify: `packages/i18n/src/locales/vi/account.ts`
- Modify: `packages/i18n/src/locales/en/account.ts`

**Interfaces:**
- Consumes: `AccountBookingViewModel`, `CustomerBookingSettlementResponse`, `Locale`.
- Produces: `BookingReviewSection`, `BookingContactSection`, `BookingFinancialSection`, and
  `PaymentTaxNote`.

- [ ] **Step 1: Build the Figma section shell and contact details**

```tsx
function DetailSection({ title, children }: DetailSectionProps) {
  return (
    <section className="border border-[#e7e7e7] bg-white px-6 py-5">
      <h2 className="text-base font-semibold text-[#1f1f1f]">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}
```

Contact rows show customer name, phone, email, and note with `-` for genuinely missing optional
values.

- [ ] **Step 2: Implement one financial selector for every Figma state**

```ts
type FinancialVariant = 'payment' | 'cancellation' | 'no-show' | 'post-service-refund';
```

- `payment`: pricing line items or total fallback, discount, total, deposit, security deposit, and
  remaining balance.
- `cancellation`: cancelled timestamp/reason when available, paid deposit, fee, refund amount, and
  settlement-derived refund status.
- `no-show`: paid deposit, no-show fee, zero service refund, plus separately refundable security
  deposit when present.
- `post-service-refund`: use settlement refunded amount/status and label it separately from a
  cancellation fee.

All arithmetic uses `BigInt`; guard optional values before conversion.

- [ ] **Step 3: Match the completed-booking review block without false persistence**

Render the five-star selector, textarea, and dashed image drop area from Figma. Until a review API
exists, the submit control must not transition into a fake saved state; existing API-provided review
content may still render read-only.

- [ ] **Step 4: Add only the translated labels required by the Figma hierarchy**

Add matching Vietnamese and English keys for section labels/status descriptions while retaining
the existing translation shape. Do not hard-code Vietnamese text inside shared components.

- [ ] **Step 5: Verify focused frontend correctness**

Run: `pnpm --filter=@booking/storefront lint && pnpm --filter=@booking/storefront typecheck`

Expected: both commands exit 0 with no translation-shape or BigInt errors.

### Task 4: Match the Figma cancellation popup and complete visual verification

**Files:**
- Modify: `apps/storefront/app/features/account/components/cancel-booking-dialog.tsx`
- Modify: `apps/storefront/app/features/account/components/booking-detail-overview.tsx`
- Modify: `apps/storefront/app/features/account/components/booking-detail-sections.tsx`

**Interfaces:**
- Consumes: existing `CancelBookingDialog` props and React Router cancellation action.
- Produces: Figma-node `2869:42948` dialog behavior without changing the mutation contract.

- [ ] **Step 1: Restyle the accessible dialog to the supplied popup**

Use the Figma width, section spacing, warning treatment, radio rows, optional free-text reason,
secondary back button, and primary destructive confirmation button. Keep Radix focus trapping,
Escape handling, `reason` validation, submission state, and server error display.

- [ ] **Step 2: Inspect all available booking states in the running storefront**

Run: `pnpm --filter=@booking/storefront dev`

Expected: the storefront starts successfully. Compare Need Payment, Coming Soon, Done, Absent,
Canceled/refunded, and the cancellation popup at desktop and mobile widths against nodes
`820:24333`, `272:35015`, `822:25599`, `2619:39692`, `986:52738`, `983:35562`, and `2869:42948`.

- [ ] **Step 3: Run the production verification suite**

Run:

```bash
pnpm --filter=@booking/storefront lint
pnpm --filter=@booking/storefront typecheck
pnpm --filter=@booking/storefront build
```

Expected: every command exits 0; no test files are created.

- [ ] **Step 4: Review the final diff for scope and API integrity**

Run: `git diff --check && git status --short`

Expected: no whitespace errors, only the planned storefront/i18n/docs files are modified, and the
dashboard is untouched.
