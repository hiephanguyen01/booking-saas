# Account Bookings — Task 2 Report

## Status

DONE

Commit: `388c671` — `feat(storefront): redesign account booking list`

## Implementation

- Tightened the URL-backed booking filters to the Figma tab geometry: compact 48px tabs, responsive horizontal padding, a 2px active underline, and a subtle bordered navigation surface. Existing `aria-current`, prefetching, error, empty, retry, and loader filtering behavior remain unchanged.
- Rebuilt `BookingHistoryCard` around the compact partner/chat and booking-code/status header. The placed timestamp remains quiet secondary copy and both header groups wrap on narrow screens.
- Replaced the payment sidebar with a responsive 4:3 listing summary, calendar line, time/duration chips, subdued mode and guest/quantity facts, the existing description/note/expandable extras, and the shared `BookingFinancialSummary` strip.
- Kept discount and promo details available in the expandable breakdown after removing the sidebar, alongside the existing pricing, security-deposit, charge, pickup, and return facts.
- Preserved chat, pay, cancel, and detail actions. The footer now positions state-sensitive cancellation, refund, and no-show guidance opposite those actions.

## Verification

All final checks below exited with code 0.

```bash
pnpm --filter=@booking/storefront lint
pnpm --filter=@booking/storefront typecheck
git diff --check
```

The first lint run identified an unused `locale` parameter left after moving the chat action from the footer. The parameter was removed, then lint and typecheck were rerun successfully. No tests were created or run, per the repository policy.

## Files changed

- `apps/storefront/app/routes/account/bookings.tsx`
- `apps/storefront/app/features/account/components/booking-history-card.tsx`

## Self-review

- Confirmed filter links retain URL state, `aria-current`, keyboard-visible focus styling, and horizontal overflow handling.
- Confirmed the header, compact schedule hierarchy, placeholder/image alt text, detail links, note, extras, financial strip, and responsive wrapping all remain present.
- Confirmed the action conditions remain `confirmed` → cancel + detail, `pending_payment` → pay form, and all other states → detail; chat remains available from the header.
- Confirmed all money comparisons continue using `BigInt`, and values are formatted through the existing VND helper/shared summary component.
- Confirmed `git diff --check` reports no whitespace errors. Only the two Task 2 source files will be staged and committed; unrelated working-tree changes are untouched.

## Concerns

- No manual browser session was run because the Task 2 brief requires storefront lint and typecheck only. The final visual pass should cover desktop/mobile and both locales as part of Task 4.
