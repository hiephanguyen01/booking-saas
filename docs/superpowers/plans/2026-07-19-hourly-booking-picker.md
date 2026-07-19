# Hourly Booking Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the listing hourly date/time controls with existing shadcn components and preserve the page scroll position during every booking-panel query update.

**Architecture:** Keep `BookingPanel` URL-driven: React Router search parameters remain the state shared with the listing loader, availability, and quote endpoints. Compose the installed shadcn `Popover`, `Calendar`, and `ToggleGroup` inside `HourlyPicker`, while passing `preventScrollReset: true` on all booking-panel search-param navigations.

**Tech Stack:** React 19, React Router 8, TypeScript, Tailwind CSS 4, shadcn/ui (`@booking/ui`), Radix UI, react-day-picker.

## Global Constraints

- Do not create test files, test configuration, test scripts, or CI test steps.
- Preserve bilingual storefront behavior and tenant semantic theme tokens.
- Preserve loader-based availability and quote refresh; the browser must not call the backend directly.
- Preserve hourly contiguous selection and the existing booking URL parameter names.
- Use existing UI components; add no dependency and run no shadcn registry installation.

---

### Task 1: Compose the shadcn hourly picker and preserve scroll

**Files:**
- Modify: `apps/storefront/app/templates/studio/booking-panel.tsx:9-15`
- Modify: `apps/storefront/app/templates/studio/booking-panel.tsx:39-40`
- Modify: `apps/storefront/app/templates/studio/booking-panel.tsx:86-88`
- Modify: `apps/storefront/app/templates/studio/booking-panel.tsx:246-416`
- Modify: `apps/storefront/app/templates/studio/booking-panel.tsx:420-588`

**Interfaces:**
- Consumes: `dateOnlyToLocal(day: string): Date`, `localToDateOnly(date: Date): string`, `toggleContiguousSlot(selected: HourlySlot[], slot: HourlySlot)`, and React Router's `useSearchParams()` setter.
- Produces: a controlled single-date popover, a controlled multi-value slot toggle group, and booking-panel navigations with `{ preventScrollReset: true }`.

- [ ] **Step 1: Add the installed shadcn and icon imports**

Add the following imports while keeping `Input` because the inventory picker still uses it:

```tsx
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@booking/ui/components/ui/popover';
import {
  ToggleGroup,
  ToggleGroupItem,
} from '@booking/ui/components/ui/toggle-group';
import { CalendarDays, ChevronDown } from 'lucide-react';
```

- [ ] **Step 2: Preserve scroll for every booking-panel navigation**

Use the actual hook setter type for picker props:

```tsx
type SetSearchParams = ReturnType<typeof useSearchParams>[1];
```

Replace each picker prop declaration of `setSp: (next: URLSearchParams) => void` with:

```tsx
setSp: SetSearchParams;
```

Pass the navigation option at all seven call sites, including mode switch, hourly day/slot/clear, daily select/clear, and inventory update:

```tsx
setSp(next, { preventScrollReset: true });
```

For the mode reset object, use:

```tsx
setSp({ mode: next }, { preventScrollReset: true });
```

- [ ] **Step 3: Replace the native hourly date input with a controlled shadcn popover**

Add popover state and a locale-aware label inside `HourlyPicker`:

```tsx
const locale = useLocale();
const [calendarOpen, setCalendarOpen] = useState(false);
const selectedDay = dateOnlyToLocal(day);
const formattedDay = new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'vi-VN', {
  weekday: 'short',
  day: '2-digit',
  month: 'long',
  year: 'numeric',
}).format(selectedDay);
```

Change `pickDay` to accept a `Date`, serialize it through `localToDateOnly`, preserve the existing parameter cleanup, and close the popover:

```tsx
function pickDay(date: Date | undefined): void {
  if (!date) return;
  const nextDay = localToDateOnly(date);
  const next = new URLSearchParams(sp);
  next.set('mode', 'hourly');
  next.set('day', nextDay);
  next.set('date', nextDay);
  next.delete('start');
  next.delete('end');
  next.delete('startTime');
  next.delete('endTime');
  setSelectionError('');
  setCalendarOpen(false);
  setSp(next, { preventScrollReset: true });
}
```

Replace the native input block with:

```tsx
<div className="flex flex-col gap-1.5">
  <PickerLabel>{t('pickDay')}</PickerLabel>
  <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
    <PopoverTrigger asChild>
      <Button
        type="button"
        variant="outline"
        className="w-full justify-start"
        aria-label={`${t('pickDay')}: ${formattedDay}`}
      >
        <CalendarDays data-icon="inline-start" />
        <span className="min-w-0 flex-1 truncate text-left">{formattedDay}</span>
        <ChevronDown data-icon="inline-end" />
      </Button>
    </PopoverTrigger>
    <PopoverContent align="start" className="w-auto p-0">
      <Calendar
        mode="single"
        selected={selectedDay}
        onSelect={pickDay}
        disabled={{ before: dateOnlyToLocal(today) }}
        autoFocus
      />
    </PopoverContent>
  </Popover>
</div>
```

- [ ] **Step 4: Replace custom slot buttons with a controlled shadcn toggle group**

Derive the selected values and route all value changes back through the existing contiguous-slot helper:

```tsx
const selectedValues = selected.map((slot) => slot.startUtc);

function changeSelectedSlots(values: string[]): void {
  const changedValue = [...selectedValues, ...values].find(
    (value) => selectedValues.includes(value) !== values.includes(value),
  );
  const changedSlot = slots.find((slot) => slot.startUtc === changedValue);
  if (changedSlot) pickSlot(changedSlot);
}
```

Use `ToggleGroup` and `ToggleGroupItem`, retaining the compact scroll region and the two-line time/price content:

```tsx
<ToggleGroup
  type="multiple"
  variant="outline"
  spacing={2}
  value={selectedValues}
  onValueChange={changeSelectedSlots}
  aria-label={t('pickSlot')}
  className="grid max-h-60 w-full grid-cols-2 overflow-y-auto pr-1"
>
  {visibleSlots.map((slot, slotIndex) => (
    <ToggleGroupItem
      key={`${slot.startUtc}-${slot.endUtc}-${slotIndex}`}
      value={slot.startUtc}
      disabled={!slot.available}
      aria-label={`${timeInTz(slot.startUtc, tz)}–${timeInTz(slot.endUtc, tz)}, ${
        slot.available ? formatVnd(slot.price) : t('unavailableSlot')
      }`}
      className="h-auto min-w-0 flex-col gap-0.5 px-1 py-2 whitespace-normal"
    >
      <span>{timeInTz(slot.startUtc, tz)}–{timeInTz(slot.endUtc, tz)}</span>
      <span className="text-xs text-muted-foreground">
        {slot.available ? formatVnd(slot.price) : t('unavailableSlot')}
      </span>
    </ToggleGroupItem>
  ))}
</ToggleGroup>
```

- [ ] **Step 5: Run focused static verification**

Run:

```bash
pnpm --filter=@booking/storefront lint
pnpm --filter=@booking/storefront typecheck
```

Expected: both commands exit `0` with no ESLint or TypeScript errors. If formatting changes are needed, use the repo formatter on the modified file and rerun both commands.

- [ ] **Step 6: Commit the implementation**

```bash
git add apps/storefront/app/templates/studio/booking-panel.tsx
git commit -m "feat(storefront): refresh hourly booking picker"
```

### Task 2: Verify production output and browser behavior

**Files:**
- Verify only: `apps/storefront/app/templates/studio/booking-panel.tsx`

**Interfaces:**
- Consumes: the Task 1 UI and the running storefront at the supplied listing URL.
- Produces: evidence that the build succeeds, the query/quote flow still works, and scroll position is retained.

- [ ] **Step 1: Build the storefront**

Run:

```bash
pnpm --filter=@booking/storefront build
```

Expected: React Router production client and server builds complete with exit code `0`.

- [ ] **Step 2: Verify the shadcn calendar interaction**

Open the supplied listing URL, scroll to the booking sidebar, open the date trigger, and confirm:

- The shadcn calendar opens in a popover.
- `2026-08-07` is selected and dates before `2026-07-19` are disabled.
- Choosing another valid date closes the popover and updates both `day` and `date` query parameters.
- The vertical scroll position after loader completion stays within a small rendering tolerance of its value before selection.

- [ ] **Step 3: Verify hourly toggle behavior**

On a day with available slots, confirm:

- Selected slots expose the shadcn pressed state and unavailable slots are disabled.
- Adding/removing a contiguous slot updates `startTime`, `endTime`, `start`, and `end` plus the quote.
- Attempting a non-contiguous slot keeps the previous URL interval and shows the existing error message.
- After each successful selection and clear action, the page remains at the booking sidebar instead of returning to the top.

- [ ] **Step 4: Review the final diff**

Run:

```bash
git diff --check HEAD~1 HEAD
git status --short
```

Expected: no whitespace errors; only the planned source and documentation commits are present, with no unrelated working-tree changes.

