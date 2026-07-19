### Task 1: Align range styling and single-day selection

**Files:**
- Modify: `apps/storefront/app/templates/studio/booking-panel.tsx:564`
- Modify: `apps/storefront/app/features/search/search-form.tsx:650`

**Interfaces:**
- Consumes: `.sf-calendar` selectors from `apps/storefront/app/app.css`, react-day-picker's default zero-minimum range behavior, and the existing `normalizeDailyRange` boundary.
- Produces: Search and detail calendars with one-click same-day selection, plus Search-equivalent range styling in detail; no new API or exported type.

- [ ] **Step 1: Record the current visual mismatch**

Open Search in daily mode and click one available day. Confirm `resetOnSelect` leaves the range incomplete after the first click. Then open `/vi/l/studio-a-han-quoc?mode=daily`, choose an available range, and confirm the detail calendar does not have the `sf-calendar` class while `SearchDatePicker` does.

- [ ] **Step 2: Apply the existing Search styling contract**

Change the detail calendar class composition to:

```tsx
<Calendar
  mode="range"
  selected={range}
  onSelect={onSelect}
  disabled={isDisabled}
  excludeDisabled
  className="sf-calendar w-full rounded-lg border border-border bg-background/40 p-2 [--cell-size:2.25rem]"
/>
```

Do not change any other `DailyPicker` props or functions.

- [ ] **Step 3: Enable one-click single-day selection in Search**

Remove only the `resetOnSelect` prop from the daily Search calendar:

```tsx
<Calendar
  mode="range"
  selected={range}
  onSelect={(next) => {
    const selected = next ?? { from: undefined };
    setRange(selected);
    if (selected.from && selected.to) close();
  }}
  disabled={calendarToday ? { before: calendarToday } : undefined}
  numberOfMonths={months}
  formatters={formatters}
  className="sf-calendar w-full [--cell-size:2.25rem]"
/>
```

Keep the existing `onSelect` handler so a complete same-day range closes the Search picker.

- [ ] **Step 4: Verify the detail and Search range states**

In the running storefront, select ranges in both the Search calendar and detail calendar. Confirm:

- From and To use primary background and primary foreground.
- Middle days use the same soft primary background.
- Hover states match.
- Today remains visually inactive until selected.
- A first click in Search creates a complete same-day selection and updates the trigger label to one date.
- A first click in detail creates `from` and `to` with the same UI date while quote timestamps retain a one-day half-open interval.
- Selecting dates in detail does not scroll to the page top.

- [ ] **Step 5: Run static verification**

Run:

```bash
pnpm --filter=@booking/storefront exec eslint app/templates/studio/booking-panel.tsx
pnpm --filter=@booking/storefront exec eslint app/features/search/search-form.tsx
pnpm --filter=@booking/storefront typecheck
pnpm --filter=@booking/storefront build
git diff --check
```

Expected: every command exits with status 0. Existing Vite source-map warnings may remain, but the build must complete successfully.

- [ ] **Step 6: Commit only the implementation files**

```bash
git add apps/storefront/app/templates/studio/booking-panel.tsx apps/storefront/app/features/search/search-form.tsx
git commit -m "fix(storefront): align daily range selection"
```

Do not stage the user's unrelated modified files.
