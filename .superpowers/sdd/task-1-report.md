# Task 1 report: Shared daily-range normalization

## Status

DONE_WITH_CONCERNS

Commit: `8a2557c feat(storefront): normalize single-day ranges`

## Implementation

- Added the browser-safe `NormalizedDailyRange` interface and `normalizeDailyRange` helper.
- Same-date UI selections normalize to a one-night half-open interval by advancing the effective `to` date one day.
- Increasing date ranges preserve their selected endpoints and derive their night count with the existing `nightsBetween` helper.
- Incomplete, incorrectly shaped, and reversed ranges return `null`.
- Added `isDailyRangeEligible` for inclusive minimum/optional maximum night limits.
- Production code imports only the existing pure `addDays` and `nightsBetween` utilities from `app/lib/time.ts`.

## TDD evidence

### RED

Command:

```bash
pnpm --filter @booking/storefront test -- app/lib/daily-range.spec.ts
```

Relevant output (exit 1):

```text
FAIL  app/lib/daily-range.spec.ts [ app/lib/daily-range.spec.ts ]
Error: Cannot find module './daily-range' imported from
'/Users/hiephanguyen01/Works/booking-saas/apps/storefront/app/lib/daily-range.spec.ts'

Test Files  1 failed | 19 passed (20)
Tests       89 passed (89)
```

The test failed for the expected reason: the production module did not exist yet.

### GREEN

Command:

```bash
pnpm --filter @booking/storefront test -- app/lib/daily-range.spec.ts
```

Relevant output (exit 0):

```text
✓ app/lib/daily-range.spec.ts (8 tests)
Test Files  20 passed (20)
Tests       97 passed (97)
```

The exact command was run once immediately after implementation and again as fresh pre-commit verification; both exited 0 with all 97 storefront tests passing.

## Additional verification

Command:

```bash
pnpm --filter @booking/storefront typecheck
```

Result: exit 0 (`react-router typegen && tsc`).

The staged diff also passed `git diff --cached --check`.

## Tests added

- Same-date selection becomes `[from, from + 1 day)` with one night.
- Increasing range is preserved and counts three nights.
- Missing endpoints are rejected.
- Incorrect date-only shape is rejected.
- Reversed endpoints are rejected.
- Minimum nights are inclusive.
- A range below the minimum is rejected.
- A range above the maximum is rejected.

## Files changed

- `apps/storefront/app/lib/daily-range.ts`
- `apps/storefront/app/lib/daily-range.spec.ts`

Only these two files were staged and committed. `.superpowers/` remains untracked/uncommitted, and the named auth route files were not edited or staged.

## Self-review

- Compared both exported interfaces and behavior line-by-line with the task brief.
- Confirmed the implementation is pure and browser-safe (no server-only or Node imports).
- Confirmed same-date normalization retains the original `selectedTo` while exposing the half-open effective `to`.
- Confirmed optional maximum handling treats both `undefined` and `null` as unbounded while respecting `0` as a real maximum.
- Confirmed no unrelated refactor or behavior was added.
- Confirmed staged scope contained exactly the two Task 1 files.

## Concerns

- Every Vitest invocation emitted repeated environment-level `EMFILE: too many open files, watch` warnings. The test process still completed deterministically with exit 0 and all 97 tests passing. No functional failure was observed, but the local file-descriptor/watch limit should be investigated separately if pristine test output is required.

## Review fix

Commit: `7813244 fix(storefront): reject invalid daily dates`

### Issue addressed

The original date-only check validated only the `YYYY-MM-DD` shape. Calendar-invalid inputs such as `2026-02-30` and `2026-99-10` could therefore produce an effective interval, including a `NaN` night count.

### RED evidence

After adding invalid-day and invalid-month cases, ran:

```bash
pnpm --filter @booking/storefront test -- app/lib/daily-range.spec.ts
```

Relevant output (exit 1):

```text
× rejects incomplete, malformed, or reversed input: 2026-02-30 → 2026-03-01
  expected { selectedFrom: '2026-02-30', ... } to be null
× rejects incomplete, malformed, or reversed input: 2026-99-10 → 2026-99-11
  expected { selectedFrom: '2026-99-10', ... } to be null

Test Files  1 failed | 19 passed (20)
Tests       2 failed | 97 passed (99)
```

The failures demonstrated both defective behaviors: the invalid day produced a bogus zero-night range, and the invalid month produced a range with `nights: NaN`.

### GREEN evidence

Added a local pure `isValidDateOnly` predicate that:

1. Requires exact `YYYY-MM-DD` shape.
2. Parses the date at UTC midnight.
3. Rejects non-finite timestamps.
4. Round-trips the parsed UTC date through ISO and requires the same calendar day.

Then ran:

```bash
pnpm --filter @booking/storefront test -- app/lib/daily-range.spec.ts
pnpm --filter @booking/storefront typecheck
```

Relevant output (both exit 0):

```text
✓ app/lib/daily-range.spec.ts (10 tests)
Test Files  20 passed (20)
Tests       99 passed (99)

> react-router typegen && tsc
```

### Files and tests

- Updated `apps/storefront/app/lib/daily-range.spec.ts` with one invalid-day and one invalid-month case.
- Updated `apps/storefront/app/lib/daily-range.ts` with strict UTC round-trip validation for both endpoints.
- The public `NormalizedDailyRange`, `normalizeDailyRange`, and `isDailyRangeEligible` interfaces remain unchanged.

### Self-review

- Confirmed invalid endpoints return `null` before `addDays` or `nightsBetween` can run.
- Confirmed valid same-day and increasing ranges retain their existing normalization behavior.
- Confirmed validation is browser-safe and uses only built-in `Date`/`Number` APIs.
- Confirmed the staged fix contained only the two Task 1 files; the report remained unstaged and no auth file was touched.
- The existing `EMFILE` watcher warnings persisted during Vitest, but tests and typecheck completed successfully.
