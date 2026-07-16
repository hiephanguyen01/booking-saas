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

