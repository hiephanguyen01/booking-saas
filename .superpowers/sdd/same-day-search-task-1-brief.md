### Task 1: Align range styling and single-day selection

**Files:**
- Modify: `apps/storefront/app/templates/studio/booking-panel.tsx:564`
- Modify: `apps/storefront/app/features/search/search-form.tsx:650`

**Interfaces:**
- Consumes: `.sf-calendar` selectors from `apps/storefront/app/app.css`, react-day-picker's default zero-minimum range behavior, and the existing `normalizeDailyRange` boundary.
- Produces: Search range selection that completes on the second click, including when both clicks use the same date, plus Search-equivalent range styling in detail; no new API or exported type.

- [ ] **Step 1: Record the current visual mismatch**

Open Search in daily mode and click one available day. Confirm the popup remains open with an incomplete range. Click the same date again and confirm it completes a one-day range. Then open `/vi/l/studio-a-han-quoc?mode=daily`, choose an available range, and confirm the detail calendar does not have the `sf-calendar` class while `SearchDatePicker` does.

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

- [ ] **Step 3: Preserve two-click range completion in Search**

Use `resetOnSelect` for the Search range calendar in both daily and inventory modes:

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
  resetOnSelect
  formatters={formatters}
  className="sf-calendar w-full [--cell-size:2.25rem]"
/>
```

Keep the existing `onSelect` handler so the first click stays open and the second click closes the picker. The second click may repeat the start date to complete a one-day range.

- [ ] **Step 4: Verify the detail and Search range states**

In the running storefront, select ranges in both the Search calendar and detail calendar. Confirm:

- From and To use primary background and primary foreground.
- Middle days use the same soft primary background.
- Hover states match.
- Today remains visually inactive until selected.
- A first click in Search leaves the range incomplete and keeps the picker open.
- A second click on the same date creates a complete same-day selection, updates the trigger label to one date, and closes the picker.
- A second click on a different date creates a multi-day range and closes the picker.
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
git commit -m "fix(storefront): support same-day search ranges"
```

Do not stage the user's unrelated modified files.
