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
