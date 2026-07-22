# Remove Hour Range From Global Search

## Goal

When a visitor selects hourly search, the shared storefront search form must no longer show or submit a start/end time range. This applies to both the homepage hero search and the compact search bar used on listing and package pages.

## Scope

- Remove the time-range control from `SearchForm` for hourly mode.
- Remove the control's local `startTime` and `endTime` state and its hourly validation condition.
- Remove the now-unused `TimeRangeField` component and clock icon import.
- Keep hourly date selection unchanged.
- Keep existing parsing and downstream support for legacy URLs that already contain `startTime` and `endTime`.
- Do not change booking-time selection, API behavior, or backend contracts.

## User Flow

For hourly mode, the global search form collects the listing type, keyword, location, date, and any type-specific fields such as guests. Submitting the form sends the hourly mode and selected date without time-range parameters. A visitor chooses an exact time later in the existing listing or booking flow.

## Compatibility

Only new submissions from the shared global search form stop emitting time parameters. Existing bookmarked or shared URLs containing valid time parameters continue to be parsed and handled by the catalog and detail routes.

## Verification

The repository forbids automated tests. Verification consists of storefront typechecking and linting, plus inspection of the resulting diff to confirm both `SearchForm` variants share the updated behavior.
