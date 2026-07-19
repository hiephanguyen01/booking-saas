# Detail Range Calendar Style

## Goal

Make the daily range calendar on the listing detail page use the same selected-range visual language as the storefront search calendar, and allow a one-day selection in both surfaces.

## Design

Reuse the existing `sf-calendar` styling hook from `apps/storefront/app/app.css` on the detail page's daily `Calendar`. Keep the detail panel's existing border, background, padding, and booking behavior. Match the search calendar's `2.25rem` cell size so range endpoints and the connecting middle cells have the same proportions.

The resulting states are:

- Range start and end use the tenant primary color and primary foreground color.
- Days between the endpoints use the existing soft primary background.
- An unselected current day has no active background.
- Hover styling matches the search calendar.

## Single-day selection

Search and detail both treat the first clicked date as a complete one-day range represented by the same `from` and `to` date. Existing daily-range normalization converts that inclusive UI value into the half-open interval ending on the following date for availability, pricing, and checkout.

Remove Search's `resetOnSelect` behavior because it intentionally leaves the first click as an incomplete range. Detail already uses the required one-click behavior and does not need selection-logic changes. Multi-day selection remains available by reopening the Search calendar and choosing a later end date, or by choosing another end date in the detail calendar.

A listing's configured `minNights` and `maxNights` remain authoritative. A normalized one-day selection can proceed only when it satisfies those constraints.

## Scope

The detail page changes only its calendar class composition. Search removes `resetOnSelect` from its daily range calendar. URL parameter shapes, availability rules, range normalization, booking times, hourly mode, and inventory mode remain unchanged.

## Verification

Because the repository prohibits tests, verify with storefront lint, typecheck, production build, and browser comparison of the Search and detail range states. Confirm a first click produces the same-date `from` and `to` selection in each surface.
