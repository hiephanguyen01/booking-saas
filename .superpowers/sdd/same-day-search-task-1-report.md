# Same-day Search Task 1 Report

## Status

Implemented and committed the scoped Search range-selection correction.

## Exact diff

```diff
diff --git a/apps/storefront/app/features/search/search-form.tsx b/apps/storefront/app/features/search/search-form.tsx
@@ -657,7 +657,7 @@ function SearchDatePicker({
           }}
           disabled={calendarToday ? { before: calendarToday } : undefined}
           numberOfMonths={months}
-          resetOnSelect={mode === 'inventory'}
+          resetOnSelect
           formatters={formatters}
           className="sf-calendar w-full [--cell-size:2.25rem]"
         />
```

## Commit

`0711c3b fix(storefront): support same-day search ranges`

Only `apps/storefront/app/features/search/search-form.tsx` was staged and committed.

## Commands and results

- `pnpm --filter=@booking/storefront exec eslint app/features/search/search-form.tsx` — exit 0.
- `pnpm --filter=@booking/storefront typecheck` — exit 0.
- `pnpm --filter=@booking/storefront build` — exit 0. Existing source-map location warnings from `packages/ui` appeared, but Vite completed both client and SSR builds.
- `git diff --check` — exit 0 before commit.
- `git diff --cached --check` — exit 0 before commit.

No tests were added or run, per the repository's no-tests policy.

## Browser observations

- Confirmed `localhost:5173` is served from `/Users/hiephanguyen01/Works/booking-saas/apps/storefront`.
- The Search calendar opens and exposes July/August 2026 date buttons.
- A browser attempt initially showed daily mode selected, but a fresh isolated attempt had the mode reset to hourly immediately after its daily radio click. This prevented reliable observation of the required first click, same-day second click, and different-day second click states. I did not treat the unreliable automation result as behavioral confirmation.

## Self-review

- The change exactly replaces the conditional inventory-only prop with unconditional `resetOnSelect` on the Search range calendar.
- The existing `onSelect` handler remains unchanged: it saves the partial range after click one and closes only when both `from` and `to` are present.
- No detail-calendar, styling, type, or unrelated dirty-file change was included.

## Concerns

Live browser confirmation of the three required daily interaction paths remains outstanding because the shared development server reset the selected mode during browser automation. Static verification and the source-level interaction contract are clean.
