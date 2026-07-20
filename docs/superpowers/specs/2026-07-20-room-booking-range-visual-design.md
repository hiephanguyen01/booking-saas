# Room Booking Range Visual Design

## Goal

Make the daily range selection in `RoomBookingDialog` read as one intentional date range while preserving the full-width seven-column calendar and 44px interaction targets.

## Selected direction

Use a soft, continuous primary-tinted band for the selected interval. The start and end dates remain 44px circular primary buttons with primary foreground text. Dates between them use the soft band with normal foreground text and slightly stronger type. A one-day range renders as one primary circle rather than a short band.

The band fills each selected column and connects across neighboring columns. At the start it begins at the center of the start button and extends right; at the end it extends from the left edge to the center of the end button. Week boundaries naturally stop and restart the band, so the selection remains legible across rows. The day buttons remain centered in their equal-width columns.

## Scope and implementation boundary

Add an opt-in range presentation to the shared `Calendar` and enable it only for the daily calendar in `RoomBookingDialog`. The hourly single-date calendar and existing calendar consumers keep their current selected styles. The implementation uses existing DayPicker range modifiers and CSS/Tailwind classes; it does not alter date-selection state, availability, pricing, quote, checkout, localization, focus handling, or disabled-date behavior.

## Interaction and accessibility

Keyboard navigation, focus rings, disabled states, hover states, and screen-reader labels remain unchanged. The endpoint buttons retain the 44x44px target. The soft band is supplemental visual information; endpoints still use text contrast and DayPicker's selected semantics.

## Verification

Per repository policy, no test files are added. Verify with storefront and UI lint/typecheck, storefront production build, and browser checks at 1280x720 and 390x844. Confirm single-day, multi-day, cross-week, disabled-date, hover, and keyboard-focus states; ensure the calendar has no horizontal overflow and the footer remains visible.
