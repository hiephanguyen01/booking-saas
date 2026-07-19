# Detail Daily Range Popup

## Goal

Replace the inline daily calendar on the listing detail page with a compact shadcn popover that follows the storefront Search range-selection behavior. The completed selection is displayed on the popover trigger.

## Interaction

The daily booking panel renders a date trigger under the existing date label. With no complete selection, the trigger shows the date-picking prompt. Clicking the trigger opens a one-month range calendar sized for the detail sidebar.

Range selection follows Search:

- The first click selects the start date and keeps the popover open.
- A second click on the same date completes a one-day range where `from` and `to` are equal.
- A second click on a different date completes a multi-day range.
- The popover closes only when both endpoints exist.

After completion, the trigger displays one localized date for a same-day selection or a localized start-to-end range for a multi-day selection. Opening the trigger again allows the customer to replace the range using the same two-click cycle.

## State and booking behavior

`DailyPicker` retains URL search parameters as its source of truth. Every selection updates `from`, `to`, `start`, and `end` through the existing normalization and availability path. An incomplete first click keeps only `from` and clears the completed interval fields; a completed selection restores the normalized booking interval.

The existing `preventScrollReset: true` navigation option remains mandatory so selecting either endpoint does not move the page to the top. Disabled dates, contiguous availability, `minNights`, `maxNights`, timezone conversion, quote loading, and checkout behavior remain unchanged.

The calendar uses the shared `sf-calendar` range styling and `resetOnSelect`, matching Search's start, middle, end, hover, and same-day states. It must not auto-focus a date when opening, so an unselected current day is not presented as selected.

## Responsive scope

Use the existing shadcn `Popover` already used elsewhere in the booking panel, with one calendar month on all viewport sizes. This keeps the picker within the narrow detail sidebar and avoids introducing a second responsive drawer implementation solely for this control.

## Out of scope

Do not change Search, hourly booking, inventory booking, availability APIs, URL parameter names, date normalization, or booking price calculations.

## Verification

The repository prohibits tests. Verify with focused storefront lint, storefront typecheck, storefront production build, and the running page at `/vi/l/studio-a-han-quoc?mode=daily`:

- The empty trigger opens the popover without scrolling.
- The first click keeps it open and shows an incomplete range.
- A second click on the same day closes it and shows one localized date.
- A second click on another day closes it and shows the localized range.
- Reopening preserves the completed range and permits replacement.
- Disabled dates and night-limit feedback continue to match availability.
