# BookingStudio mobile: search and service detail refresh

## Scope

Refresh only the **Search** and **Service detail** device views in `BookingStudio Mobile v2.dc.html`. The Home view, iOS frame, runtime support, and image-slot implementation remain untouched.

## Design direction

An editorial booking experience: warm off-white surfaces, near-black navigation chrome, BookingStudio red for the primary action and selected states, and a deliberately consistent content rhythm. The screens prioritize photography, package pricing, and scan-friendly booking metadata.

## Shared visual language

- Keep the existing `Be Vietnam Pro` typeface and BookingStudio red (`#ee3b2f`).
- Use a single hierarchy for section labels, titles, muted metadata, outlined controls, and solid primary actions.
- Standardize icon-button dimensions, card radii, inline spacing, selected pills, and sticky bottom actions across Search and Detail.
- Retain every existing image slot, runtime construct, tenant-derived data value, and interaction handler.

## Search screen

- Preserve category selection, query summary, edit-search drawer, filter drawer, sorting pills, favorite state, and bottom navigation.
- Refine the dark search header into a clear two-level navigation area: compact back/category row and a prominent query/filter row.
- Use a more deliberate result-card layout: proportioned image column, compact camera count badge, readable title/metadata stack, rating and booking signal, then price anchored at the card bottom.
- Keep filters visibly countable and make active sort/filter states visually consistent with package selection on the detail view.

## Service detail screen

- Preserve favorite state, selected gallery state, package selection/expansion, review filters, related-service favorites, and sticky package-price action.
- Give the hero and gallery stronger visual prominence while keeping the top navigation fixed and readable over dark chrome.
- Reorganize metadata, provider, introduction, packages, reviews, and similar services into a clear editorial sequence with consistent section dividers and internal spacing.
- Make the selected package unmistakable while keeping non-selected packages easy to compare. Keep policy and price information close to each package action.

## Non-goals

- No change to the Home device view.
- No change to `image-slot.js`, `ios-frame.jsx`, or `support.js`.
- No data-model, tenant configuration, or behavior changes beyond visual layout and wiring existing controls where needed.

## Verification

- Load the `.dc.html` prototype locally and confirm the two redesigned device views render without runtime errors.
- Exercise category, sort, filter, edit-search, favorite, gallery, package, expansion, and review-filter interactions.
- Confirm the Home view remains visually and structurally unchanged.
