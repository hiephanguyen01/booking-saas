# Design QA — Mobile booking & account (04–08)

Date: 2026-08-10  
Reference: `StudioHub Mobile v2.dc.html`
Viewport: 393 × 852 (mobile), 1440 × 900 (desktop regression)

## Coverage

| Screen | Mobile result | Interaction/data checks |
| --- | --- | --- |
| 04 — Checkout | Pass | Real quote and cancellation tiers, promotion dialog, contact validation with `role="alert"`, payment selection, legal notice, sticky deposit/submit bar |
| 05 — Booking outcome | Pass | Pending polling presentation, failed retry presentation, mock payment success, masked email, booking code, paid/balance values, real recommendation rail and empty-fallback behavior |
| 06 — Booking history | Pass | Real counts for all six filters, horizontal tabs, client search by booking code, search-empty state, pay/cancel/review/detail/chat actions |
| 07 — Account overview | Pass | Authenticated profile, real upcoming/completed/favorite stats, real review badge, account/support navigation and logout form |
| 08 — Booking detail | Pass | Shared guest/account composition, policy/contact/financial sections, account bottom nav with inline actions, pending/confirmed/completed/cancelled/no-show eligibility |

## Visual comparison

- Mobile hierarchy follows the supplied artifact: fixed dark flow chrome, compact tenant-aware cards, horizontal history tabs, bottom navigation on success/history/overview, and sticky primary actions on checkout/detail.
- Desktop checkout and account booking surfaces retain their existing composition from `md` upward; verified at 1440 × 900.
- Tenant semantic theming is preserved. StudioHub renders its configured primary styling; BookingStad renders a green checkout CTA and financial accents without component-level tenant color literals.
- VI and EN copy/layout were exercised. Catalog content remains tenant-provided and may stay Vietnamese in an English shell when the seeded tenant data itself is Vietnamese.

## Interaction matrix

- Checkout: invalid phone, promotion open/close, active payment method, real submit/redirect.
- Outcome: pending state, `payment=error` retry state, mock-pay success, recommendation load and guest `?view=detail` access.
- History: counts `6 / 1 / 1 / 2 / 1 / 1`, completed filter, matching and non-matching search.
- Detail actions: pending → inline pay; confirmed → low-emphasis cancel at the end of the content; completed → review when eligible; cancelled/no-show → no ineligible destructive CTA. Refund/dispute information remains conditional on real settlement/eligibility data.

## Issues found and resolved

- P1: recommendations were gated only by payment status, while a confirmed booking can be the success source. Fixed by treating succeeded payment or confirmed/completed booking as success and scoping catalog recommendations to the booked listing type.
- P2: the shared mobile detail was missing its cancellation-policy section. Added the frozen policy snapshot with localized cutoff/fee text.
- P2: guest detail could expose the normal bottom navigation beside a sticky action. The route shell now hides it for `?view=detail`.

No open P0–P2 visual or interaction issue remains in the checked scope. Seeded placeholder media is data content, not a mobile component defect.
