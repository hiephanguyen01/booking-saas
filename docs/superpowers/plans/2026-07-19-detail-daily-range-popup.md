# Detail Daily Range Popup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the listing detail page's inline daily calendar with a compact shadcn popover that completes same-day or multi-day ranges using the same two-click behavior as Search.

**Architecture:** Keep `DailyPicker` and URL search parameters as the single source of booking state. Add only local popover-open state and locale-aware display formatting around the existing range selection, availability, normalization, and quote flow; close the popover only when `onSelect` returns both endpoints.

**Tech Stack:** React 19, React Router 8 search parameters, shadcn `Popover`/`Calendar`/`Button`, react-day-picker range mode, Tailwind CSS, i18next.

## Global Constraints

- Do not create tests or test configuration; repository verification is lint, typecheck, build, and running the app.
- Preserve `setSp(..., { preventScrollReset: true })` for every date-selection navigation.
- Preserve URL parameter names, availability filtering, timezone conversion, night constraints, quote loading, and checkout behavior.
- Use one calendar month inside the detail sidebar on all viewport sizes.
- Do not modify Search, hourly booking, inventory booking, API code, or shared calendar behavior.
- Preserve unrelated worktree changes and stage only this task's intended hunk in `booking-panel.tsx`.

---

### Task 1: Convert `DailyPicker` to a range popover

**Files:**
- Modify: `apps/storefront/app/templates/studio/booking-panel.tsx:483-582`

**Interfaces:**
- Consumes: `DateRange`, `SetSearchParams`, `dateLabelInTz`, `dateOnlyToLocal`, `localToDateOnly`, `eligibleDailyRange`, `normalizeDailyRange`, `Popover`, `PopoverTrigger`, `PopoverContent`, and the current listing locale/timezone.
- Produces: the existing private `DailyPicker` component with a controlled `calendarOpen: boolean` popover; no exported interface changes.

- [ ] **Step 1: Capture the current detail behavior before editing**

Run the storefront and open:

```text
http://localhost:5175/vi/l/studio-a-han-quoc?mode=daily
```

Confirm the current daily calendar is inline, note one available date and one disabled date, and confirm the booking panel currently updates `from`, `to`, `start`, and `end` after a completed range. Do not alter application state outside this page.

- [ ] **Step 2: Add locale, formatter, open-state, and trigger-label state to `DailyPicker`**

Immediately after the existing translation hook, add locale and controlled popover state:

```tsx
const locale = useLocale();
const [calendarOpen, setCalendarOpen] = useState(false);
const calendarFormatters = useMemo(() => {
  const tag = locale === 'en' ? 'en-GB' : 'vi-VN';
  const caption = new Intl.DateTimeFormat(tag, { month: 'long', year: 'numeric' });
  const weekday = new Intl.DateTimeFormat(tag, { weekday: 'short' });
  return {
    formatCaption: (month: Date) => caption.format(month),
    formatWeekdayName: (date: Date) => weekday.format(date),
  };
}, [locale]);
```

After deriving `range`, add the localized trigger label and the initial visible month:

```tsx
const formatDate = (value: string): string => dateLabelInTz(value, tz, locale);
const selectedDateLabel = fromDate
  ? toDate
    ? fromDate === toDate
      ? formatDate(fromDate)
      : `${formatDate(fromDate)} - ${formatDate(toDate)}`
    : `${formatDate(fromDate)} - ${t('selectRange')}`
  : t('pickDates');
const calendarMonth = range?.from ?? (days[0] ? dateOnlyToLocal(days[0].date) : undefined);
```

This mirrors Search by rendering one date for `from === to`, a start/end string for a completed multi-day range, and an incomplete label after the first click.

- [ ] **Step 3: Replace the inline calendar with the controlled shadcn popover**

Keep `PickerLabel` and replace only the current inline `<Calendar />` with:

```tsx
<Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
  <PopoverTrigger asChild>
    <Button
      type="button"
      variant="outline"
      className="h-11 w-full justify-start gap-2 px-3 text-left font-normal"
      aria-label={`${t('pickDates')}: ${selectedDateLabel}`}
    >
      <CalendarDays className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate">{selectedDateLabel}</span>
      <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    </Button>
  </PopoverTrigger>
  <PopoverContent
    align="start"
    sideOffset={8}
    className="w-auto max-w-[calc(100vw-2rem)] p-0"
  >
    <div className="overflow-x-auto p-2">
      <Calendar
        mode="range"
        selected={range}
        onSelect={(next) => {
          onSelect(next);
          if (next?.from && next.to) setCalendarOpen(false);
        }}
        disabled={isDisabled}
        excludeDisabled
        defaultMonth={calendarMonth}
        resetOnSelect
        formatters={calendarFormatters}
        className="sf-calendar w-full [--cell-size:2.25rem]"
      />
    </div>
  </PopoverContent>
</Popover>
```

Do not add `autoFocus` or `initialFocus`. Keep the existing night-count/minimum-night message immediately below the popover.

- [ ] **Step 4: Run focused static verification**

Run:

```bash
pnpm exec eslint apps/storefront/app/templates/studio/booking-panel.tsx
pnpm --filter=@booking/storefront typecheck
```

Expected: both commands exit `0` with no new lint or TypeScript errors. Do not add tests because the repository explicitly prohibits them.

- [ ] **Step 5: Run the storefront production build**

Run:

```bash
pnpm --filter=@booking/storefront build
```

Expected: exit `0`. Existing non-fatal Vite source-map warnings are acceptable; new compile or bundle failures are not.

- [ ] **Step 6: Verify the interaction in the browser**

At `http://localhost:5175/vi/l/studio-a-han-quoc?mode=daily`, verify all of the following:

1. With no `from` or `to`, only the date trigger is visible and no date is styled as selected.
2. Opening the trigger shows one calendar month without moving the document scroll position.
3. Clicking an available date once keeps the popover open, writes only `from`, clears `to`/`start`/`end`, and keeps the document scroll position unchanged.
4. Clicking that same date again closes the popover, writes equal `from` and `to`, restores normalized `start`/`end`, and displays one localized date on the trigger.
5. Reopen the popover, click a new start and a different available end; the popover closes only after the end click and the trigger displays both dates.
6. Disabled dates remain unselectable, night-limit feedback remains visible below the trigger, and a valid completed range still loads its quote/enables booking.

- [ ] **Step 7: Review and commit only the intended component change**

Run:

```bash
git diff --check -- apps/storefront/app/templates/studio/booking-panel.tsx
git diff -- apps/storefront/app/templates/studio/booking-panel.tsx
```

Expected: no whitespace errors; the diff contains only the daily popover state, label/formatter state, and inline-calendar replacement. Stage the intended `DailyPicker` hunk without staging unrelated pre-existing changes, then commit:

```bash
git commit -m "fix(storefront): add detail daily range popup"
```

Expected: the commit succeeds and contains only the intended `booking-panel.tsx` changes.
