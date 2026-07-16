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

