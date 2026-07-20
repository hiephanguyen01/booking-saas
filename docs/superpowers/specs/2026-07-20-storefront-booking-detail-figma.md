# Storefront Booking Detail Figma Specification

## Objective

Rebuild the customer-facing booking detail page at `/account/bookings/:code` so it faithfully
matches the seven supplied Figma frames while continuing to render real booking, settlement,
cancellation-policy, and listing data returned by the API.

The tenant and partner dashboard booking-detail pages are explicitly out of scope.

## Figma Sources

| Node | Figma frame | Product state |
| --- | --- | --- |
| `822:25599` | Booking detail - Done | Completed booking with review form |
| `986:52738` | Booking detail - Absent | No-show booking and dispute action |
| `983:35562` | Booking detail - Canceled | Cancelled booking and refund summary |
| `820:24333` | Booking detail - Need Payment | Pending-payment booking and payment action |
| `272:35015` | Booking detail - Comming soon | Confirmed or pending-approval upcoming booking |
| `2619:39692` | Booking detail - Done | Completed/refund variation |
| `2869:42948` | Popup - Canceled | Customer cancellation dialog |

## Architecture

Use one state-driven `BookingDetailPanel` rather than seven duplicated pages. Shared visual
sections render the same structure for every booking, while small status-specific sections select
their content and actions from `AccountBookingViewModel`, the settlement response, and the frozen
cancellation-policy snapshot.

The existing React Router loader/action remains the only data and mutation boundary. The browser
must not call the backend directly. No visual state may depend on hard-coded example booking data.

## Page Structure

The page follows the Figma desktop composition inside the existing storefront account shell:

1. Page title and back navigation for booking history.
2. Booking card header with partner/studio identity, chat action, booking code, creation timestamp,
   and API-derived status badge.
3. Service/listing overview with image fallback, listing title, resource, date, time, duration,
   booking mode, quantity or guests, description, and arbitrary listing attributes.
4. Status-specific policy/action strip.
5. Review form for completed bookings only.
6. Customer contact information.
7. Payment, cancellation, no-show, or post-service refund summary.
8. Tax/invoice note.

Desktop spacing, typography, borders, colors, button hierarchy, and card geometry should match the
Figma references. Tablet and mobile layouts collapse naturally without hiding, truncating, or
reordering essential booking information.

## API State Mapping

| API status | UI state |
| --- | --- |
| `draft`, `pending_payment` | Need Payment |
| `pending_approval`, `confirmed` | Coming Soon |
| `completed` | Done |
| `no_show` | Absent |
| `cancelled`, `rejected`, `expired` | Canceled |
| `refunded` | Canceled/refunded, selected from settlement data |

The refund variant is selected from `CustomerBookingSettlementResponse`; it must not be inferred
from display copy or a fixed amount.

## Dynamic Data Requirements

- Partner name, listing name, resource, image, description, schedule, duration, mode, quantity,
  guest count, and attributes come from `BookingResponse` through `AccountBookingViewModel`.
- Original amount, discount, final amount, deposit, paid amount, balance, fees, and refund use VND
  bigint strings and the existing currency formatter.
- Cancellation deadlines and refund percentages use the booking's frozen
  `cancellationPolicySnapshot`.
- Cancellation/no-show/refund copy may use translated labels, but all dates and monetary values are
  calculated from API data.
- Missing optional data has a deliberate empty/fallback presentation; sample Figma values are never
  substituted.
- Existing locale routing and Vietnamese/English translations remain supported.

## Actions

- Chat links to the existing account messaging route.
- Pay Now submits the existing React Router `pay` intent.
- Cancel Booking uses the Figma cancellation popup and the existing cancellation action.
- Dispute links to the existing help route.
- Review UI remains client-side presentation until an API review mutation exists; it must not claim
  that a review was persisted when no backend capability is available.

## Accessibility and Responsiveness

- Preserve semantic headings, definition lists, form labels, image alt text, and visible keyboard
  focus.
- Status must be conveyed by text as well as color.
- Dialog focus management and keyboard dismissal continue to use the existing accessible dialog
  primitive.
- Touch targets remain usable when the design collapses below the desktop canvas width.

## Verification

The repository forbids automated tests. Verification consists of:

- focused storefront lint;
- focused storefront typecheck;
- focused storefront production build;
- manual visual inspection of all available seeded/API booking states at desktop and mobile widths;
- comparison against screenshots of all seven Figma nodes.

## Non-Goals

- No dashboard tenant/partner booking-detail changes.
- No backend schema or endpoint changes unless an existing API field is currently dropped by the
  storefront view-model mapping.
- No invented review persistence, refund calculation, or payment behavior.
- No test files or test configuration.
