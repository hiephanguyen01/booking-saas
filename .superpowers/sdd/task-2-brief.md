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

