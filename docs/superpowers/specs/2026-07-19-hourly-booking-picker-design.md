# Hourly Booking Picker Design

## Goal

Improve the listing page's hourly booking controls so the date picker follows the existing
shadcn design system and changing a date or time does not scroll the page back to the top.

## Scope

- Change only the hourly picker in `apps/storefront/app/templates/studio/booking-panel.tsx`.
- Preserve the current URL-driven loader flow, availability refresh, quote calculation, contiguous
  slot-selection rule, bilingual labels, tenant theme tokens, and checkout query parameters.
- Do not change the daily or inventory picker behavior beyond sharing a small navigation helper if
  required to keep the implementation consistent.

## Interaction Design

### Date selection

- Replace the native date input with a shadcn `Button` that opens a shadcn `Popover` containing a
  single-date `Calendar`.
- Display the selected date using the active storefront locale.
- Disable dates before the tenant-timezone current day.
- Close the popover after a valid date is selected.
- Selecting a new date clears the existing hourly interval, as it does today.

### Time selection

- Present the available time slots as a shadcn `ToggleGroup` with multiple selection enabled.
- Keep the existing two-column, scrollable sidebar layout so the panel remains compact.
- Continue to show time, price, unavailable state, selected count, availability filter, clear action,
  and contiguous-selection feedback.
- Slot selection remains controlled by the existing `toggleContiguousSlot` domain helper. The UI
  must not allow a non-contiguous interval to enter the URL.

### Scroll behavior

- Every search-parameter update initiated inside the booking panel uses React Router's
  `preventScrollReset: true` navigation option.
- The route loader may still revalidate availability and quote data; only the scroll restoration
  behavior changes.
- Mode changes, date changes, slot changes, clear selection, and the existing daily/inventory
  picker updates should all preserve the user's current scroll position.

## Components and Data Flow

`BookingPanel` remains the owner of URL search parameters. `HourlyPicker` converts the selected
calendar day to the existing `day` and `date` parameters, and converts selected atomic slots to the
existing `startTime`, `endTime`, `start`, and `end` parameters. The route loader remains the source
of availability and quote data.

Use the existing components from `@booking/ui`: `Button`, `Calendar`, `Popover`, and `ToggleGroup`.
No new package or registry component is required.

## Accessibility and Responsive Behavior

- The date trigger has a clear accessible name and communicates the chosen date.
- The calendar uses its built-in single-selection semantics and keyboard navigation.
- The toggle group exposes pressed/disabled states through the shadcn primitives.
- Controls retain visible focus treatment and fit the existing 284 px desktop sidebar.
- Semantic theme tokens are used so tenant branding and dark-mode-compatible colors continue to
  work.

## Error Handling

- Ignore an undefined calendar selection rather than writing an invalid day to the URL.
- Keep the current unavailable-slot and non-contiguous-selection messages.
- If availability returns no slots, retain the existing empty-state message.

## Verification

The repository's no-tests policy applies. Verification consists of:

1. Storefront lint.
2. Storefront typecheck.
3. Storefront production build.
4. Browser verification on the supplied listing URL, checking the popover calendar, contiguous slot
   selection, URL/quote updates, and unchanged scroll position after date and time selections.

