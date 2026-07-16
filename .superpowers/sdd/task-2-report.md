# Task 2 Report — Allow one-day ranges in storefront search

## Status

Implemented, verified, and committed.

## Implementation

- Updated `validDailyRange` to delegate date validation and same-day normalization to `normalizeDailyRange`.
- Preserved `canSubmitSearch` delegation, which now accepts a completed same-date daily selection.
- Removed DayPicker's `min={1}` so its default zero-night range can complete from one selected date.
- Kept `resetOnSelect`, the controlled inclusive `DateRange`, and the existing close condition.
- Rendered a completed same-date range as one localized date instead of a duplicate `date - date` label.
- Kept the visible calendar range inclusive while hidden search inputs use the normalized half-open next-day boundary.

## TDD Evidence

### RED

Command:

```bash
pnpm --filter @booking/storefront test -- app/features/search/search-state.spec.ts
```

Result: exit 1, with the two expected regression failures:

```text
FAIL ... accepts complete daily ranges and normalizes one selected day
AssertionError: expected null to deeply equal { from: "2026-08-10", to: "2026-08-11" }

FAIL ... allows a completed one-day daily selection
AssertionError: expected false to be true

Test Files  1 failed | 19 passed (20)
Tests       2 failed | 98 passed (100)
```

This demonstrated that the pre-change validator rejected the same-date selection and consequently disabled submission.

### GREEN / exact brief verification

Command:

```bash
pnpm --filter @booking/storefront test -- app/lib/daily-range.spec.ts app/features/search/search-state.spec.ts
```

Result: exit 0.

```text
Test Files  20 passed (20)
Tests       100 passed (100)
```

## Additional Verification

Focused lint:

```bash
cd apps/storefront
pnpm exec eslint app/features/search/search-state.ts app/features/search/search-state.spec.ts app/features/search/search-form.tsx
```

Result: exit 0, no output.

Storefront typecheck:

```bash
cd apps/storefront
pnpm run typecheck
```

Result: exit 0 (`react-router typegen && tsc`).

Repository hygiene:

```bash
git diff --check
```

Result: exit 0, no whitespace errors.

## Files Changed

- `apps/storefront/app/features/search/search-state.spec.ts`
- `apps/storefront/app/features/search/search-state.ts`
- `apps/storefront/app/features/search/search-form.tsx`

This report is intentionally not included in the product-code commit.

## Self-review

- A same-date UI selection remains inclusive in React state (`range.from` and `range.to` are the same calendar day), so the trigger label renders only that selected date.
- `validDailyRange(rangeFrom, rangeTo)` returns the normalized effective boundary. The hidden inputs therefore submit `from=2026-08-10` and `to=2026-08-11` for a one-day selection.
- Multi-day and incomplete-range labels are unchanged.
- Incomplete, malformed, impossible calendar dates, and reversed ranges remain rejected through `normalizeDailyRange`.
- `canSubmitSearch` was not changed; it continues to delegate daily validation to `validDailyRange`.
- No Calendar component source, dependency, or registry installation was changed.
- Only the three Task 2 files are staged for commit; unrelated/untracked `.superpowers` content remains outside the commit.

## Concerns

- Vitest emitted repeated `EMFILE: too many open files, watch` environment warnings in both RED and GREEN runs. The RED assertions failed for the intended behavior, and the GREEN command still completed with exit 0 and 100/100 tests passing.

## Commit

`23d3157 fix(storefront): allow one-day search ranges`
