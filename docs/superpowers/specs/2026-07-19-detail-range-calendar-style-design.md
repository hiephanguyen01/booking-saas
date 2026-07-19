# Detail Range Calendar Style

## Goal

Make the daily range calendar on the listing detail page use the same selected-range visual language as the storefront search calendar.

## Design

Reuse the existing `sf-calendar` styling hook from `apps/storefront/app/app.css` on the detail page's daily `Calendar`. Keep the detail panel's existing border, background, padding, and booking behavior. Match the search calendar's `2.25rem` cell size so range endpoints and the connecting middle cells have the same proportions.

The resulting states are:

- Range start and end use the tenant primary color and primary foreground color.
- Days between the endpoints use the existing soft primary background.
- An unselected current day has no active background.
- Hover styling matches the search calendar.

## Scope

Only the detail page calendar class composition changes. URL parameters, availability rules, range normalization, booking times, and search calendar behavior remain unchanged.

## Verification

Because the repository prohibits tests, verify with storefront lint, typecheck, production build, and browser comparison of the search and detail range states.
