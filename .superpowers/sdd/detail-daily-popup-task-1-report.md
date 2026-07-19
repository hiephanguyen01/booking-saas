# Detail Daily Popup — Task 1 Report

## Implementation

- Converted the detail-page `DailyPicker` from an inline calendar to a controlled shadcn `Popover`.
- Added locale-aware calendar caption and weekday formatters, the `calendarOpen` state, an accessible trigger, localized selected-range labels, and initial visible-month selection.
- The calendar remains open after a first date, closes after a complete range (including same-day), preserves `excludeDisabled`, uses `resetOnSelect`, and leaves night/minimum-night feedback directly below the trigger.

## Verification

- `pnpm exec eslint apps/storefront/app/templates/studio/booking-panel.tsx` — passed (exit 0).
- `pnpm --filter=@booking/storefront typecheck` — passed (exit 0).
- `pnpm --filter=@booking/storefront build` — passed (exit 0). Existing Vite source-map location warnings were emitted; no compile or bundle failure occurred.
- Browser pre-check at `http://localhost:5175/vi/l/studio-a-han-quoc?mode=daily` confirmed the prior inline July 2026 calendar, July 19 available, July 18 disabled, and completed same-day selection writes `from`, `to`, `start`, and `end`.
- Browser post-check confirmed: no selected date when clean; trigger opens one month; first click writes only `from` and leaves the popover open; same-day second click closes it and writes normalized `from`, `to`, `start`, and `end`; a 20–21 July range closes after the end click and renders both localized dates; July 22 remains disabled; night feedback remains visible.

## Files Changed

- `apps/storefront/app/templates/studio/booking-panel.tsx` — only the private `DailyPicker` component.
- Commit: `5a239cb fix(storefront): add detail daily range popup`.

## Selective-Staging Evidence

- `git diff --cached --check` passed.
- `git diff --cached --name-only` returned only `apps/storefront/app/templates/studio/booking-panel.tsx`.
- The staged diff contains exactly the three DailyPicker hunks: formatter/open state, trigger label/month, and inline-calendar replacement. Existing import-order and HourlyPicker edits remain unstaged.

## Self-Review

- Confirmed requested values and props are present verbatim: controlled `Popover`, `sideOffset={8}`, mobile width cap, `defaultMonth`, `resetOnSelect`, formatters, and no autofocus props.
- Confirmed no exported interface changed and no tests were created or run, per repository policy.

## Concerns

- In the local browser environment, the completed valid 20–21 July range retained a disabled “Chọn lịch để tiếp tục” button, despite normalized URL dates and visible night feedback. This appears to be unavailable quote data in the running environment rather than a picker failure; the pre-change page also showed the booking action disabled after a completed same-day range.
- Browser DOM evaluation did not return a scroll-position value, so unchanged scroll was verified visually during popover opening and selection rather than by a numeric assertion.
