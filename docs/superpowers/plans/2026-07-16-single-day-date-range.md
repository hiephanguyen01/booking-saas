# Single-day Date Range Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let storefront customers complete search and daily-booking date ranges with one selected calendar day while preserving half-open API intervals and listing night constraints.

**Architecture:** Add one browser-safe, pure daily-range normalizer under `app/lib` so search and booking share exactly the same inclusive-UI to half-open-business conversion. Search delegates its existing `validDailyRange` boundary to that helper; the booking panel keeps inclusive URL dates for calendar display but creates quote/checkout timestamps only from an eligible normalized range.

**Tech Stack:** TypeScript, React 19, React Router framework mode, react-day-picker through `@booking/ui`, Vitest, date/time helpers already in `apps/storefront/app/lib/time.ts`.

## Global Constraints

- Selecting one date completes a valid one-day UI range in both storefront pickers.
- A same-date UI range is evaluated as `[selected day, next calendar day)` by search, availability, pricing, quote, and checkout code.
- Multi-day behavior remains unchanged.
- `minNights` and configured `maxNights` remain authoritative for booking eligibility.
- Incomplete, reversed, or malformed ranges emit no effective interval.
- Do not change backend contracts, database range semantics, pricing rules, inventory mode, or hourly booking behavior.
- Use pnpm only and preserve unrelated edits in `apps/storefront/app/routes/auth/`.

## File Map

- Create `apps/storefront/app/lib/daily-range.ts`: pure inclusive-to-half-open normalization plus night-limit eligibility.
- Create `apps/storefront/app/lib/daily-range.spec.ts`: focused normalization and eligibility unit tests.
- Modify `apps/storefront/app/features/search/search-state.ts`: delegate `validDailyRange` to the shared normalizer.
- Modify `apps/storefront/app/features/search/search-state.spec.ts`: lock same-day search behavior and preserve invalid/multi-day cases.
- Modify `apps/storefront/app/features/search/search-form.tsx`: allow react-day-picker to complete a same-day range.
- Modify `apps/storefront/app/templates/studio/booking-panel.tsx`: preserve inclusive calendar URL state, generate normalized timestamps, and enforce min/max nights.

---

### Task 1: Shared daily-range normalization

**Files:**
- Create: `apps/storefront/app/lib/daily-range.ts`
- Create: `apps/storefront/app/lib/daily-range.spec.ts`

**Interfaces:**
- Consumes: `addDays(date: string, days: number): string` and `nightsBetween(from: string, to: string): number` from `apps/storefront/app/lib/time.ts`.
- Produces: `normalizeDailyRange(from: string | undefined, to: string | undefined): NormalizedDailyRange | null` and `isDailyRangeEligible(range: NormalizedDailyRange, minNights: number, maxNights?: number | null): boolean`.

- [ ] **Step 1: Write failing normalization tests**

Create `apps/storefront/app/lib/daily-range.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { isDailyRangeEligible, normalizeDailyRange } from './daily-range';

describe('normalizeDailyRange', () => {
  it('normalizes a same-date UI selection to one half-open day', () => {
    expect(normalizeDailyRange('2026-08-10', '2026-08-10')).toEqual({
      selectedFrom: '2026-08-10',
      selectedTo: '2026-08-10',
      from: '2026-08-10',
      to: '2026-08-11',
      nights: 1,
    });
  });

  it('preserves a complete increasing range', () => {
    expect(normalizeDailyRange('2026-08-10', '2026-08-13')).toMatchObject({
      from: '2026-08-10',
      to: '2026-08-13',
      nights: 3,
    });
  });

  it.each([
    [undefined, undefined],
    ['2026-08-10', undefined],
    ['10-08-2026', '2026-08-10'],
    ['2026-08-11', '2026-08-10'],
  ])('rejects incomplete, malformed, or reversed input: %s → %s', (from, to) => {
    expect(normalizeDailyRange(from, to)).toBeNull();
  });
});

describe('isDailyRangeEligible', () => {
  const oneDay = normalizeDailyRange('2026-08-10', '2026-08-10')!;

  it('accepts one day when the listing minimum is one night', () => {
    expect(isDailyRangeEligible(oneDay, 1, null)).toBe(true);
  });

  it('rejects one day outside listing night limits', () => {
    expect(isDailyRangeEligible(oneDay, 2, null)).toBe(false);
    expect(isDailyRangeEligible(oneDay, 1, 0)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
pnpm --filter @booking/storefront test -- app/lib/daily-range.spec.ts
```

Expected: FAIL because `./daily-range` does not exist.

- [ ] **Step 3: Implement the minimal shared helper**

Create `apps/storefront/app/lib/daily-range.ts`:

```ts
import { addDays, nightsBetween } from './time';

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface NormalizedDailyRange {
  selectedFrom: string;
  selectedTo: string;
  from: string;
  to: string;
  nights: number;
}

export function normalizeDailyRange(
  from: string | undefined,
  to: string | undefined,
): NormalizedDailyRange | null {
  if (!from || !to || !DATE_ONLY_RE.test(from) || !DATE_ONLY_RE.test(to) || to < from) {
    return null;
  }
  const effectiveTo = to === from ? addDays(from, 1) : to;
  return {
    selectedFrom: from,
    selectedTo: to,
    from,
    to: effectiveTo,
    nights: nightsBetween(from, effectiveTo),
  };
}

export function isDailyRangeEligible(
  range: NormalizedDailyRange,
  minNights: number,
  maxNights?: number | null,
): boolean {
  return range.nights >= minNights && (maxNights == null || range.nights <= maxNights);
}
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```bash
pnpm --filter @booking/storefront test -- app/lib/daily-range.spec.ts
```

Expected: all normalization and eligibility tests PASS.

- [ ] **Step 5: Commit the helper**

```bash
git add apps/storefront/app/lib/daily-range.ts apps/storefront/app/lib/daily-range.spec.ts
git commit -m "feat(storefront): normalize single-day ranges"
```

---

### Task 2: Allow one-day ranges in storefront search

**Files:**
- Modify: `apps/storefront/app/features/search/search-state.spec.ts`
- Modify: `apps/storefront/app/features/search/search-state.ts`
- Modify: `apps/storefront/app/features/search/search-form.tsx:422-436`

**Interfaces:**
- Consumes: `normalizeDailyRange` from Task 1.
- Produces: existing `validDailyRange(from, to): { from: string; to: string } | null`, now returning an effective next-day `to` for same-date selections.

- [ ] **Step 1: Change the search-state test to require one-day normalization**

In `apps/storefront/app/features/search/search-state.spec.ts`, replace the same-date rejection inside `accepts only a complete increasing daily range` and rename the test:

```ts
it('accepts complete daily ranges and normalizes one selected day', () => {
  expect(validDailyRange('2026-08-10', undefined)).toBeNull();
  expect(validDailyRange('2026-08-10', '2026-08-10')).toEqual({
    from: '2026-08-10',
    to: '2026-08-11',
  });
  expect(validDailyRange('2026-08-10', '2026-08-09')).toBeNull();
  expect(validDailyRange('2026-08-10', '2026-08-12')).toEqual({
    from: '2026-08-10',
    to: '2026-08-12',
  });
});
```

In `describe('canSubmitSearch')`, move the same-date case out of the rejection test and add:

```ts
it('allows a completed one-day daily selection', () => {
  expect(canSubmitSearch('daily', '2026-08-10', '2026-08-10')).toBe(true);
});
```

- [ ] **Step 2: Run the search-state test and verify RED**

Run:

```bash
pnpm --filter @booking/storefront test -- app/features/search/search-state.spec.ts
```

Expected: FAIL because same-date input currently returns `null` and cannot submit.

- [ ] **Step 3: Delegate search validation to the shared normalizer**

In `apps/storefront/app/features/search/search-state.ts`, add:

```ts
import { normalizeDailyRange } from '../../lib/daily-range';
```

Replace `validDailyRange` with:

```ts
export function validDailyRange(
  from: string | undefined,
  to: string | undefined,
): { from: string; to: string } | null {
  const range = normalizeDailyRange(from, to);
  return range ? { from: range.from, to: range.to } : null;
}
```

Do not change `canSubmitSearch`; its delegation to `validDailyRange` will now accept the same-date selection.

- [ ] **Step 4: Let react-day-picker complete the same-date range**

In the daily `<Calendar>` inside `apps/storefront/app/features/search/search-form.tsx`, remove only this prop:

```tsx
min={1}
```

Keep `resetOnSelect`, the controlled inclusive `range`, and the existing close condition. With the default zero-night minimum, react-day-picker returns `{ from: day, to: day }`; the label remains one selected date while `validDailyRange` emits the next-day effective boundary.

- [ ] **Step 5: Render a same-date range as one date in the trigger label**

Inside `SearchDatePicker`, add a boolean before `label`:

```ts
const isSingleDayRange =
  Boolean(range.from && range.to) &&
  localToDateOnly(range.from!) === localToDateOnly(range.to!);
```

Replace the daily branch of `label` with:

```ts
: range.from
  ? isSingleDayRange
    ? day(range.from)
    : `${day(range.from)} - ${range.to ? day(range.to) : t('home.endDate')}`
  : t('home.pickDate');
```

This keeps multi-day and incomplete labels unchanged while avoiding a duplicate `10/08 - 10/08` label for a one-day selection.

- [ ] **Step 6: Run focused and full search tests**

Run:

```bash
pnpm --filter @booking/storefront test -- app/lib/daily-range.spec.ts app/features/search/search-state.spec.ts
```

Expected: both test files PASS.

- [ ] **Step 7: Commit the search behavior**

```bash
git add apps/storefront/app/features/search/search-state.ts apps/storefront/app/features/search/search-state.spec.ts apps/storefront/app/features/search/search-form.tsx
git commit -m "fix(storefront): allow one-day search ranges"
```

---

### Task 3: Allow one-day ranges in the listing booking calendar

**Files:**
- Modify: `apps/storefront/app/lib/daily-range.ts`
- Modify: `apps/storefront/app/lib/daily-range.spec.ts`
- Modify: `apps/storefront/app/templates/studio/booking-panel.tsx:276-360`

**Interfaces:**
- Consumes: `normalizeDailyRange` and `isDailyRangeEligible` from Task 1; existing `zonedToUtcIso` for the effective half-open timestamps.
- Produces: `eligibleDailyRange(from, to, minNights, maxNights): NormalizedDailyRange | null`, inclusive `from`/`to` URL values for calendar display, and normalized `start`/`end` values only when the configured night limits are satisfied.

- [ ] **Step 1: Add failing booking-eligibility tests**

Add `eligibleDailyRange` to the import in `apps/storefront/app/lib/daily-range.spec.ts` and extend the file with:

```ts
describe('eligibleDailyRange', () => {
  it('returns an effective one-day booking range when one night is allowed', () => {
    expect(eligibleDailyRange('2026-08-10', '2026-08-10', 1, null)).toMatchObject({
      selectedFrom: '2026-08-10',
      selectedTo: '2026-08-10',
      from: '2026-08-10',
      to: '2026-08-11',
      nights: 1,
    });
  });

  it('returns null when the normalized range violates listing limits', () => {
    expect(eligibleDailyRange('2026-08-10', '2026-08-10', 2, null)).toBeNull();
    expect(eligibleDailyRange('2026-08-10', '2026-08-12', 1, 1)).toBeNull();
  });

  it('returns null for an incomplete selection', () => {
    expect(eligibleDailyRange('2026-08-10', undefined, 1, null)).toBeNull();
  });
});
```

The complete import becomes:

```ts
import {
  eligibleDailyRange,
  isDailyRangeEligible,
  normalizeDailyRange,
} from './daily-range';
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
pnpm --filter @booking/storefront test -- app/lib/daily-range.spec.ts
```

Expected: FAIL because `eligibleDailyRange` is not exported.

- [ ] **Step 3: Implement the booking eligibility boundary**

Append to `apps/storefront/app/lib/daily-range.ts`:

```ts
export function eligibleDailyRange(
  from: string | undefined,
  to: string | undefined,
  minNights: number,
  maxNights?: number | null,
): NormalizedDailyRange | null {
  const range = normalizeDailyRange(from, to);
  return range && isDailyRangeEligible(range, minNights, maxNights) ? range : null;
}
```

Run:

```bash
pnpm --filter @booking/storefront test -- app/lib/daily-range.spec.ts
```

Expected: all daily-range tests PASS.

- [ ] **Step 4: Normalize selection and enforce night limits in `DailyPicker`**

In `apps/storefront/app/templates/studio/booking-panel.tsx`, import:

```ts
import { eligibleDailyRange, normalizeDailyRange } from '../../lib/daily-range';
```

Read `maxNights` next to `minNights`:

```ts
const maxNights = Number.isFinite(Number(dailyCfg.maxNights))
  ? Number(dailyCfg.maxNights)
  : null;
```

Replace the timestamp portion of `onSelect` with:

```ts
const fromStr = localToDateOnly(next.from);
params.set('from', fromStr);

if (next.to) {
  const selectedTo = localToDateOnly(next.to);
  params.set('to', selectedTo);
  const bookable = eligibleDailyRange(fromStr, selectedTo, minNights, maxNights);
  if (bookable) {
    params.set('start', zonedToUtcIso(bookable.from, checkinTime, tz));
    params.set('end', zonedToUtcIso(bookable.to, checkoutTime, tz));
  } else {
    params.delete('start');
    params.delete('end');
  }
} else {
  params.delete('to');
  params.delete('start');
  params.delete('end');
}
setSp(params);
```

Replace the raw night calculation with:

```ts
const normalized = normalizeDailyRange(fromDate ?? undefined, toDate ?? undefined);
const nights = normalized?.nights ?? 0;
```

Remove `nightsBetween` from this file's imports if no other call remains.

- [ ] **Step 5: Let the booking calendar complete a same-date selection**

Remove this prop from the daily `<Calendar>`:

```tsx
min={minNights + 1}
```

Eligibility now belongs to the normalized business range, not react-day-picker's zero-night UI count. The existing disabled-date function continues to prevent unavailable selections.

- [ ] **Step 6: Verify booking integration GREEN**

Run:

```bash
pnpm --filter @booking/storefront test -- app/lib/daily-range.spec.ts
pnpm --filter @booking/storefront lint
pnpm --filter @booking/storefront typecheck
```

Expected: unit tests PASS, lint PASS with no unused imports, and type checking PASS.

- [ ] **Step 7: Commit the booking behavior**

```bash
git add apps/storefront/app/lib/daily-range.ts apps/storefront/app/lib/daily-range.spec.ts apps/storefront/app/templates/studio/booking-panel.tsx
git commit -m "fix(storefront): allow one-day booking ranges"
```

---

### Task 4: Full verification and live UI check

**Files:**
- Verify only; modify the Task 1-3 files only if a verification failure traces directly to this feature.

**Interfaces:**
- Consumes: completed Tasks 1-3.
- Produces: evidence that search and booking behave correctly without regressions.

- [ ] **Step 1: Run the complete storefront quality suite**

Run each command independently:

```bash
pnpm --filter @booking/storefront test
pnpm --filter @booking/storefront typecheck
pnpm --filter @booking/storefront lint
pnpm --filter @booking/storefront build
```

Expected: every command exits 0 with no test failures, TypeScript errors, ESLint errors, or build errors.

- [ ] **Step 2: Start the storefront for browser verification**

Run:

```bash
pnpm --filter @booking/storefront dev
```

Expected: React Router reports a local storefront URL and remains running.

- [ ] **Step 3: Verify desktop and mobile search calendars**

At a desktop viewport, select daily mode, open the search date popover, and click one available future day once. Confirm the popover closes, the label shows the one selected date, and submitting emits `from=<day>&to=<next-day>`.

At a mobile viewport, repeat in the drawer and confirm the same label and URL behavior.

- [ ] **Step 4: Verify the listing daily booking calendar**

Open a daily listing with `minNights = 1`, select one available day once, and confirm:

- the calendar retains one selected day;
- the URL keeps equal inclusive `from` and `to` display dates;
- `start` is the selected date's configured check-in time;
- `end` is the next date's configured checkout time;
- the quote loads and the booking button is enabled.

Open or configure a listing with `minNights > 1`, select one day, and confirm no `start`/`end` parameters are emitted and booking remains disabled.

- [ ] **Step 5: Inspect the final diff and working tree**

Run:

```bash
git diff --check
git status --short
git diff -- apps/storefront/app/lib/daily-range.ts apps/storefront/app/lib/daily-range.spec.ts apps/storefront/app/features/search/search-state.ts apps/storefront/app/features/search/search-state.spec.ts apps/storefront/app/features/search/search-form.tsx apps/storefront/app/templates/studio/booking-panel.tsx
```

Expected: no whitespace errors; only the planned feature files plus the user's pre-existing auth edits appear.

- [ ] **Step 6: Commit verification-only fixes if needed**

If Step 1-5 required no code changes, do not create an empty commit. If a verification failure required an in-scope fix, stage only the affected Task 1-3 files and commit:

```bash
git add apps/storefront/app/lib/daily-range.ts apps/storefront/app/lib/daily-range.spec.ts apps/storefront/app/features/search/search-state.ts apps/storefront/app/features/search/search-state.spec.ts apps/storefront/app/features/search/search-form.tsx apps/storefront/app/templates/studio/booking-panel.tsx
git commit -m "fix(storefront): complete date range verification"
```
