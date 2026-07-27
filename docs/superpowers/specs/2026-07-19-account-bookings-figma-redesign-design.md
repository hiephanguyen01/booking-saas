# Account Bookings Figma Redesign

## Goal

Redesign the authenticated storefront booking history and booking detail views to match the visual
hierarchy of Figma nodes `272:35576` and `820:24381`, while preserving BookingOS's existing data,
actions, tenant theme, bilingual UI, and responsive behavior.

## Scope

- Booking history: `/:locale/account/bookings`.
- Booking detail: `/:locale/account/bookings/:code`.
- Shared account booking components and the `account` i18n namespace as required.
- No backend or contract changes. The existing booking response already exposes all required money
  fields.

## Visual Direction

Use the compact, editorial booking-card composition from Figma rather than the current dashboard-like
card with a large payment sidebar. The result should feel lightweight and easy to scan: white panels,
thin dividers, restrained shadows, clear typography, small neutral time chips, and tenant-primary
accents for active tabs and primary actions.

The implementation adapts the Figma reference to the existing storefront design tokens. It must not
hardcode the red brand shown in Figma because storefront colors are tenant-controlled. Existing
Lucide icons and shared UI primitives are reused where their glyphs match the reference.

## Booking History

### Page and filters

- Keep the existing account shell and localized page heading.
- Render status filters as a single horizontally scrollable tab bar matching the Figma proportions.
- Preserve URL-based filtering and loader behavior.

### Booking card

Each card has four visual bands:

1. Header: partner name and chat action on the left; booking code and status on the right.
2. Booking summary: compact listing image, listing/resource name, date, and time/duration chips.
3. Financial strip: three equally weighted values for paid deposit, total, and remaining balance.
4. Footer: cancellation/refund guidance on the left and context-sensitive actions on the right.

Secondary information such as pricing lines, extra charges, equipment handoff timestamps, and notes
remains available in the existing expandable breakdown, but must not compete with the primary scan
path.

### Financial semantics

- **Paid deposit** uses `paidAmount`, because it represents money actually received.
- **Total** uses `finalAmount`, the payable amount after discount.
- **Remaining** is `max(finalAmount - paidAmount, 0)`, already exposed by `balanceAmount` in the view
  model.
- Paid deposit receives a subtle positive treatment.
- Total is the strongest neutral value.
- A positive remaining balance receives tenant-primary emphasis; zero renders localized paid-in-full
  copy instead of a warning treatment.
- All values use tabular figures and the existing VND formatter.

On desktop the strip uses three horizontal columns. On narrow screens it remains a three-column grid
with compact labels and wrapping-safe amounts so financial comparison stays immediate.

## Booking Detail

The detail page follows the second Figma frame as a vertical sequence:

1. Back navigation.
2. Primary booking panel with partner, code, status, listing image, schedule, resource facts, listing
   attributes, and actions.
3. Cancellation/refund guidance associated with the primary panel.
4. Contact information panel.
5. Payment information panel with price breakdown, discount, total, paid deposit, security deposit
   when relevant, and remaining balance.
6. Existing settlement/refund and review content when applicable.

The current action behavior remains unchanged: pay, cancel, chat, dispute, settlement display, and
review display continue using existing routes/forms.

## Responsive and Accessibility

- Desktop matches the compact proportions of the Figma frames within the existing account content
  width.
- Mobile stacks header and action areas without horizontal page overflow; only the filter bar may
  scroll horizontally.
- Interactive elements keep visible keyboard focus, semantic links/buttons, and existing form
  behavior.
- Status and payment meaning must not rely on color alone; every value keeps a text label.
- Listing images retain useful alt text and placeholders retain screen-reader labels.

## Data and Error Handling

No new client-side fetching is introduced. Routes continue to load data server-to-server through the
existing loaders. Existing unavailable, empty, action-error, and missing-image states are retained and
restyled consistently.

Money arithmetic continues using `BigInt`; no floating-point conversion is allowed.

## Verification

The repository's no-tests policy applies. Verify with:

- Storefront lint.
- Storefront typecheck.
- Storefront build.
- Manual inspection of Vietnamese and English list/detail views at desktop and mobile widths, covering
  pending payment, confirmed, completed, cancelled, and no-show states when data is available.

