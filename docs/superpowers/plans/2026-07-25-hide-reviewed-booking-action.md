# Hide Reviewed Booking Action Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the booking-history footer action for completed bookings that already have a review while preserving the review action for eligible completed bookings.

**Architecture:** Keep the change inside the existing `BookingHistoryCard` presentation boundary. `CardFooter` will return no markup for a completed booking whose review status is `reviewed`; the existing `pending` branch remains the only completed-booking review action.

**Tech Stack:** React 19, React Router 8, TypeScript, Tailwind CSS, pnpm/Turborepo

## Global Constraints

- Do not add automated tests or test configuration; ADR 0005 requires verification through lint, typecheck, build, and the running app.
- Do not change API contracts, loaders, repositories, review eligibility, translations, or submission behavior.
- Preserve the existing pending-review callback type: `(review: Extract<CustomerReviewItem, { status: 'pending' }>) => void`.

---

### Task 1: Hide the reviewed-booking footer

**Files:**
- Modify: `apps/storefront/app/features/account/components/booking-history-card.tsx:115-154`

**Interfaces:**
- Consumes: `AccountBookingViewModel.review`, a `CustomerReviewItem | null`
- Produces: `CardFooter(...)`, which returns `null` for `variant === 'completed'` with `review.status === 'reviewed'`

- [x] **Step 1: Add the reviewed-booking early return**

Immediately after `const review = booking.review`, add:

```tsx
if (booking.variant === 'completed' && review?.status === 'reviewed') {
  return null;
}
```

This removes the entire footer instead of leaving an empty bordered strip.

- [x] **Step 2: Remove the obsolete reviewed action**

Delete the branch that renders the **Đã đánh giá** link:

```tsx
{booking.variant === 'completed' && review?.status === 'reviewed' ? (
  <Button asChild variant="outline" size="sm">
    <Link to={detailPath}>{t('reviews.reviewed')}</Link>
  </Button>
) : null}
```

Keep the existing `review?.status === 'pending'` button unchanged.

- [x] **Step 3: Run static verification**

Run:

```bash
pnpm turbo lint typecheck build
```

Expected: all Turbo tasks complete successfully with exit code `0`.

- [x] **Step 4: Verify the running storefront**

Open:

```text
http://localhost:5173/vi/account/bookings?status=completed
```

Using the seeded customer account, confirm:

- `BK-HEALTH03` does not show **Đã đánh giá** and has no empty footer strip.
- `BK-HEALTH01` does not show **Đã đánh giá** and has no empty footer strip.
- The source branch for `review.status === 'pending'` still renders **Đánh giá** and passes its pending review to `onReview`.

- [x] **Step 5: Inspect the final diff**

Run:

```bash
git diff --check
git diff -- apps/storefront/app/features/account/components/booking-history-card.tsx
```

Expected: no whitespace errors and only the reviewed-footer presentation change.
