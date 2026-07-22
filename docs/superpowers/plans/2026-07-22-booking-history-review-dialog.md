# Booking History Review Dialog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Open the existing review popup from completed booking-history cards and details, then reflect the submitted review after loader revalidation.

**Architecture:** Add storefront-only review loading/mapping and a shared action helper. Booking routes compose those helpers with their existing loaders/actions, while booking components reuse `ReviewDialog` and `ReviewMediaGallery` instead of maintaining a second review form.

**Tech Stack:** React Router 8 framework mode, React 19, TypeScript, Zod, i18next, shared `@booking/ui` components.

## Global Constraints

- Do not add tests, test scripts, or test configuration per ADR 0005.
- Do not fetch the backend from browser components.
- Do not change backend, Prisma schema, or `@booking/contracts`.
- Preserve all current uncommitted review-media work.

---

### Task 1: Share customer review route helpers

**Files:**
- Create: `apps/storefront/app/features/account/server/customer-reviews.server.ts`

**Interfaces:**
- Produces `loadCustomerReviewsByBooking(request, accessToken)` returning a `Map<string, CustomerReviewItem>`.
- Produces `submitCustomerReview(request, locale, redirectPath)` returning the shared action response.

- [ ] Load all relevant review items server-side and index them by booking ID.
- [ ] Move the existing form parsing, Zod validation, and API post behavior into the shared action helper.
- [ ] Preserve stable action data `{ ok, error, bookingId }` for `ReviewDialog`.

### Task 2: Enrich booking loaders and actions

**Files:**
- Modify: `apps/storefront/app/features/account/lib/booking-history.ts`
- Modify: `apps/storefront/app/features/account/server/booking-history.server.ts`
- Modify: `apps/storefront/app/routes/account/reviews.tsx`
- Modify: `apps/storefront/app/routes/account/bookings.tsx`
- Modify: `apps/storefront/app/routes/account/booking-detail.tsx`

**Interfaces:**
- `AccountBookingViewModel.review` is populated from `CustomerReviewItem`.
- Booking list/detail action recognizes review form submissions before existing pay/cancel/dispute intents.

- [ ] Map pending and reviewed customer items into the booking view-model without fixtures.
- [ ] Load reviews alongside bookings and merge by `bookingId`.
- [ ] Delegate review submissions from all three route actions to the shared helper.

### Task 3: Reuse ReviewDialog in booking UI

**Files:**
- Modify: `apps/storefront/app/features/account/components/review-dialog.tsx`
- Modify: `apps/storefront/app/features/account/components/booking-history-card.tsx`
- Modify: `apps/storefront/app/features/account/components/booking-detail-panel.tsx`
- Modify: `apps/storefront/app/features/account/components/booking-detail-sections.tsx`

**Interfaces:**
- `ReviewDialog` accepts `action: string`.
- Booking list/detail components receive the pending `CustomerReviewItem` needed by the dialog.

- [ ] Make the dialog submit to the supplied route action.
- [ ] Replace the completed-card link with an in-place popup trigger only for pending reviews.
- [ ] Replace the disabled detail form with a popup CTA and render reviewed media through the shared gallery.
- [ ] Keep reviewed bookings protected from duplicate submission.

### Task 4: Verify

**Files:** None.

- [ ] Run storefront lint, typecheck, security, and production build; expect exit code 0.
- [ ] Run `git diff --check`; expect exit code 0.
- [ ] Verify the completed list card and detail CTA open the same dialog.
- [ ] Verify closing the dialog does not submit and mobile layouts do not overflow.
