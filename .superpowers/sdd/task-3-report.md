# Task 3 Report — Allow one-day listing booking ranges

## Outcome

Implemented the daily booking eligibility boundary and integrated it into the listing booking calendar. A same-date calendar selection now remains inclusive in the display URL (`from=to`) while eligible quote/checkout timestamps use the normalized half-open effective range ending on the following day.

## TDD evidence

### RED — missing export

After adding only the requested `eligibleDailyRange` tests, ran:

```text
pnpm --filter @booking/storefront test -- app/lib/daily-range.spec.ts
```

Result: exit code 1. The requested failure was reproduced consistently:

```text
app/lib/daily-range.spec.ts (13 tests | 3 failed)
TypeError: (0 , eligibleDailyRange) is not a function
Test Files  1 failed | 19 passed (20)
Tests       3 failed | 100 passed (103)
```

This established that all three new tests failed specifically because the function was not exported, rather than because of an unrelated assertion or syntax error.

### GREEN — eligibility boundary

Added the minimal `eligibleDailyRange` implementation, which normalizes the range and returns it only when `isDailyRangeEligible` accepts its night count. Re-ran the same command:

```text
Test Files  20 passed (20)
Tests       103 passed (103)
Exit code   0
```

## Booking panel integration

- Reads `maxNights` alongside `minNights`.
- Stores the selected calendar endpoints unchanged in `from` and `to`, including equal endpoints.
- Uses `eligibleDailyRange` before setting quote/checkout `start` and `end`.
- Converts the normalized effective `from` and `to` to UTC using the listing check-in/check-out times and resource timezone.
- Deletes stale `start` and `end` when the selection is cleared, incomplete, or outside min/max-night limits.
- Uses `normalizeDailyRange` for the displayed night count so an equal-endpoint selection displays one night.
- Removes DayPicker's `min` prop so the calendar can complete a same-date range; business eligibility remains enforced by the normalized boundary.

## Verification

Fresh post-integration commands:

```text
pnpm --filter @booking/storefront test -- app/lib/daily-range.spec.ts
  PASS — 20 files, 103 tests, exit 0

pnpm --filter @booking/storefront lint
  PASS — eslint app, exit 0

pnpm --filter @booking/storefront typecheck
  PASS — react-router typegen && tsc, exit 0

git diff --check
  PASS — exit 0, no whitespace errors
```

Note: Vitest printed repeated `EMFILE: too many open files, watch` watcher warnings during both RED and GREEN runs. The test process still completed deterministically with the expected RED exit 1 and subsequent GREEN exit 0. No warning originated from the changed code.

## Files changed

- `apps/storefront/app/lib/daily-range.ts`
- `apps/storefront/app/lib/daily-range.spec.ts`
- `apps/storefront/app/templates/studio/booking-panel.tsx`

This report is intentionally left untracked from the Task 3 commit, per the instruction to stage only Task 3 source/test files.

## Self-review

- **Stale timestamps:** Every non-bookable daily path deletes both `start` and `end`: no selection, incomplete selection, below minimum, above maximum, invalid/reversed range.
- **Inclusive calendar display:** A complete equal-date selection sets both `from` and `to` to the same selected date. Only effective timestamp conversion uses the next-day normalized `to`.
- **Minimum nights:** `eligibleDailyRange` rejects normalized ranges below `minNights`; tests cover a one-day range against minimums 1 and 2.
- **Maximum nights:** `eligibleDailyRange` rejects normalized ranges above `maxNights`; tests cover a two-night range against maximum 1.
- **Scope:** The diff changes only `DailyPicker` within `booking-panel.tsx`; hourly and inventory behavior is untouched. Search integration and Task 2 implementation were not modified.
- **React behavior:** Selection-derived values remain computed during render or inside the event handler; no new effects, state, fetches, or rendering work were introduced.

## Concerns

- Non-blocking environment concern: Vitest reports `EMFILE` watcher warnings despite completing successfully. This may merit separate local file-descriptor/process cleanup, but it does not affect Task 3 correctness or verification results.
