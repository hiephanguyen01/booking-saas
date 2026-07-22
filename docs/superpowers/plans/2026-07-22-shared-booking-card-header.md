# Shared Booking Card Header Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reuse the booking-history header component in Account Review cards.

**Architecture:** Generalize `BookingCardHeader` around fields shared by booking and review records. Both consumers pass their own data directly while the header owns all markup and styling.

**Tech Stack:** React 19, React Router 8, TypeScript, Tailwind CSS, i18next.

## Global Constraints

- No tests per ADR 0005.
- Do not change review or booking data contracts.
- Preserve unrelated 404-page worktree changes.

---

### Task 1: Generalize and reuse the header

**Files:**
- Modify: `apps/storefront/app/features/account/components/booking-card-header.tsx`
- Modify: `apps/storefront/app/features/account/components/booking-history-card.tsx`
- Modify: `apps/storefront/app/features/account/components/review-booking-card.tsx`

**Interfaces:**
- `BookingCardHeader` consumes `partnerName`, `listingSlug`, `bookingCode`, `status`, `locale`, and optional `createdAt`.

- [ ] Replace the view-model prop with primitive shared fields while preserving existing markup and styling.
- [ ] Update booking history to pass fields from `AccountBookingViewModel`.
- [ ] Delete the duplicated review header and pass review fields into the shared component.

### Task 2: Verify

**Files:** None.

- [ ] Run Storefront lint, typecheck, and production build; expect exit code 0.
- [ ] Run `git diff --check`; expect exit code 0.
- [ ] Visually confirm Account Reviews and Booking History use the same header at desktop and mobile widths.
