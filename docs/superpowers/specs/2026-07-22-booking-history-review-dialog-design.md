# Booking History Review Dialog Design

## Goal

Reuse the Account Reviews dialog from booking-history list cards and completed-booking details. Only completed bookings that still have a pending customer review may open the dialog.

## Data flow

- Booking loaders continue to load bookings from the existing booking APIs.
- A storefront server helper loads customer reviews and indexes them by `bookingId`.
- Completed booking view-models receive their real review state. Existing reviews include rating, content, media, and partner reply; pending items retain the fields required by `ReviewDialog`.
- Review submission uses one shared route-action helper. The Reviews page, booking list, and booking detail actions all validate with `createReviewInputSchema` and call `POST /customer/reviews` server-to-server.
- `ReviewDialog` accepts an explicit action URL. After success, `useFetcher` closes the dialog and React Router revalidates the active booking loader.

## UI behavior

- The completed card CTA opens the dialog when the booking is pending review.
- A reviewed card links to booking detail and does not permit a duplicate review.
- The booking-detail review section displays the existing review with the shared media gallery, or a single CTA that opens the same dialog.
- Mobile behavior inherits the already-verified review dialog and booking card breakpoints.

## Constraints and verification

- No backend, database, or public-contract changes.
- No browser-to-backend requests; all review reads and submissions use storefront loaders/actions.
- No test files per ADR 0005.
- Verify storefront lint, typecheck, security, build, and both list/detail interactions manually.
