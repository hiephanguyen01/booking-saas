# Shared Booking Card Header Design

## Goal

Make review cards and booking-history cards render the exact same header component for partner identity, chat navigation, booking code, and booking status.

## Component contract

`BookingCardHeader` receives primitive shared fields: `partnerName`, `listingSlug`, `bookingCode`, `status`, `locale`, and optional `createdAt`. Booking history passes values from `AccountBookingViewModel`; Account Reviews passes values from `CustomerReviewItem` with status `completed`.

The component keeps the current booking-history layout, translation keys, responsive wrapping, iconography, status badge, and optional screen-reader booking timestamp. No consumer constructs a fake booking view-model.

## Scope and verification

- Replace the custom header markup in `ReviewBookingCard` with `BookingCardHeader`.
- Keep review card body, review popup, loaders, actions, and APIs unchanged.
- Do not modify unrelated 404-page worktree changes.
- Add no tests per ADR 0005; verify with Storefront lint, typecheck, build, and a visual comparison of Account Reviews and Booking History.
