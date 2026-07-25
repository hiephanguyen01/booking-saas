# Hide Reviewed Booking Action

## Goal

Keep the completed-booking action area focused on actions the customer can still take.

## Behavior

- A completed booking without a review continues to show the **Đánh giá** action.
- A completed booking that already has a review shows no review action.
- When a reviewed completed booking has no other footer content, its footer is omitted entirely so
  the card does not retain an empty bordered area.
- The booking detail page and the customer reviews page are unchanged.

## Implementation Boundary

Update only the storefront booking-history card presentation. Do not change review eligibility,
API contracts, loaders, repositories, translations, or submission behavior.

## Verification

- Manually open the completed-bookings filter and confirm reviewed bookings have no footer action or
  empty footer.
- Confirm the pending-review branch still renders the **Đánh giá** button by code-path inspection and
  available local data.
- Run the project lint, typecheck, and build checks. Do not add automated tests, per ADR 0005.
