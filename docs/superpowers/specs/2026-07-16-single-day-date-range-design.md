# Single-day Date Range Design

**Date:** 2026-07-16

## Goal

Allow customers to complete a date-range selection with one calendar day in both the storefront search form and the listing booking calendar.

## User-facing behavior

- Selecting one date completes a valid one-day range.
- The calendar and its label continue to show the single date the customer selected.
- Multi-day selection continues to work as it does today.
- A listing's configured `minNights` remains authoritative. A one-day selection cannot proceed when the listing requires more than one night.

## Range semantics

The UI selection uses inclusive calendar dates, so a one-day choice is represented as the same start and end date. API, availability, pricing, and checkout boundaries continue to use a half-open interval.

At the boundary between UI state and business/API state:

- If the selected end date equals the start date, normalize the effective end date to the next calendar day.
- If the selected end date is later, preserve it.
- If the selected end date is earlier or either date is malformed, reject the range.

For example, selecting only `2026-08-10` is displayed as `2026-08-10` and evaluated as `[2026-08-10, 2026-08-11)`.

## Components and data flow

### Storefront search

The range calendar permits a zero-night UI range. A pure search-state helper converts the selected inclusive dates into a valid half-open daily range before hidden form fields, URL state, availability checks, and pricing consume it. The search popover/drawer closes after the one-day selection is complete.

### Listing booking calendar

The daily calendar also permits a same-date selection. URL display parameters keep the inclusive selection, while `start` and `end` timestamps use the normalized half-open range. Night count, quote requests, checkout parameters, and booking eligibility use the normalized range.

The booking action is enabled only when the normalized night count satisfies the listing's `minNights` and, when configured, `maxNights`.

## Error handling

- Incomplete or reversed ranges remain invalid.
- Invalid ranges do not emit hidden date fields, quote timestamps, or bookable checkout parameters.
- Unavailable dates remain disabled by the existing availability rules.

## Testing

- Add failing unit tests proving a same-date UI range normalizes to one day.
- Preserve tests for incomplete, reversed, and multi-day ranges.
- Add focused tests for booking-range normalization and minimum-night eligibility.
- Run storefront tests, type checking, linting, and a production build.
- Verify both desktop popover and mobile drawer behavior in the running storefront.

## Scope

This change does not alter backend interval contracts, database range semantics, pricing rules, inventory mode, or hourly booking behavior.
