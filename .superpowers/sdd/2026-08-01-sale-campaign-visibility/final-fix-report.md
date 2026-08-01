# Sale campaign visibility — final review fix report

**Date:** 2026-08-01

**Branch:** `codex/sale-campaign-visibility`

**Review source:** `.superpowers/sdd/2026-08-01-sale-campaign-visibility/final-review.md`

## Implemented findings

### 1. Daily month navigation loads detailed availability

- Added a dedicated daily-month resource fetcher in
  `apps/storefront/app/features/booking-widget/hooks/use-booking-dialog-controller.ts`.
- A daily month change now starts two independent requests: detailed availability anchored at the
  first date of that month, and the existing compact sale-calendar summary request.
- Detailed availability owns date enablement; sale-summary failure remains a non-fatal warning and
  cannot cancel or replace the detailed request.
- Kept quote/selection requests on their existing fetcher so month navigation does not overwrite a
  completed selection's quote state.
- Removed the stale availability-derived `endMonth` cap from the dialog calendar and its controller.

Files:

- `apps/storefront/app/features/booking-widget/hooks/use-booking-dialog-controller.ts`
- `apps/storefront/app/features/booking-widget/hooks/use-booking-dialog-steps-controller.ts`
- `apps/storefront/app/features/booking-widget/components/booking-dialog-steps.tsx`

### 2. Partner week view honors hourly `date_range`

- `ruleCoveringHour()` now accepts a `date_range` when `dateMatches(rule, date)` is true before
  considering recurring rules.
- The existing highest-priority reduction remains unchanged, matching the pricing kernel and month
  view's whole-day interpretation.

File:

- `apps/dashboard/app/features/partner/lib/listing-calendar.ts`

### 3. Dated search campaign identity follows the winning quote

- `PricedListing` now carries an optional applied-campaign selection when its price came from an
  exact quote; explicit `null` means the quote has no honest single campaign identity.
- The projection reads discounted quote lines' `appliedRuleId` values and summarizes only the rules
  that actually produced the price via the existing sale-campaign kernel.
- Quotes containing distinct campaign labels (including named versus unnamed) suppress campaign
  identity instead of choosing one label for a combined price.
- Grouped dated cards take campaign metadata from the exact cheapest child/quote. Undated discovery
  still uses the existing deepest listing-wide campaign ordering.
- Exact regular/current price totals and the tenant-scoped transaction remain unchanged.

File:

- `apps/api/src/modules/catalog/application/use-cases/search-public-catalog.use-case.ts`

### 4. Search card price accessibility

- Replaced the visual line-through wrapper with semantic `<del>` for the regular price.
- Added localized screen-reader labels for regular and current price, following the booking price
  panel pattern without changing the compact/mobile layout.

Files:

- `apps/storefront/app/features/catalog/components/search-result-card.tsx`
- `packages/i18n/src/locales/vi/listing.ts`
- `packages/i18n/src/locales/en/listing.ts`

## Safe minor fix

Real reductions that round below one percent now display as 1%, never `−0%` or `up to 0%`.
`saleDiscountPercent()` is the shared API calculation used by both listing campaign summaries and
availability calendar projections. Storefront exact-price and Dashboard preview calculations apply
the same BigInt half-up formula and minimum.

Files:

- `apps/api/src/shared/domain/pricing/sale-campaign.ts`
- `apps/api/src/shared/domain/availability/calendar-sale-summary.ts`
- `packages/contracts/src/contracts/common.ts`
- `apps/storefront/app/lib/sale-campaign.ts`
- `apps/dashboard/app/features/partner/components/listing-calendar/campaign-preview.tsx`

## Deferred minor

The Dashboard campaign lifecycle `Date.now()` SSR boundary was deferred. Fixing it correctly requires
capturing a request clock in the partner calendar loader, carrying it through the route/controller
model, and refreshing that clock intentionally after client mutations. A local render-only change
would still permit stale lifecycle state and would exceed this focused final-review round. The
existing campaign state remains bounded to a rare boundary-crossing hydration mismatch and does not
affect booking price truth, which is determined server-side by the quote kernel's captured clock.

## Verification

No automated tests or test configuration were added, per ADR 0005.

Focused checks (all exit 0):

- `pnpm --filter=@booking/contracts build`
- `pnpm --filter=@booking/i18n build`
- `pnpm --filter=@booking/api lint`
- `pnpm --filter=@booking/api typecheck`
- `pnpm --filter=@booking/api build`
- `pnpm --filter=@booking/storefront lint`
- `pnpm --filter=@booking/storefront typecheck`
- `pnpm --filter=@booking/storefront build`
- `pnpm --filter=@booking/dashboard lint`
- `pnpm --filter=@booking/dashboard typecheck`
- `pnpm --filter=@booking/dashboard build`
- `pnpm --filter=@booking/i18n lint`
- `pnpm --filter=@booking/contracts lint`

Full repository gate (exit 0):

```sh
pnpm check:no-tests && pnpm check:module-cycles && pnpm check:frontend-structure && pnpm --filter=@booking/storefront security && pnpm turbo lint typecheck build && pnpm --filter=@booking/api check:rls
```

Observed results: no-tests policy passed; 18-module graph acyclic; frontend structure and Storefront
security passed; Turbo completed 24/24 lint/typecheck/build tasks; RLS coverage passed for all 50
tenant-scoped tables.

Static flow reasoning also confirmed:

- navigating a daily month dispatches detailed and summary loads through separate React Router
  fetchers, and only detailed availability contributes to `openDates`;
- `date_range` enters the same priority comparison as exact-hour and recurring rules;
- every exact search campaign comes from discounted line `appliedRuleId` values belonging to the
  same quote stored as the winning price;
- the search card retains its existing flex-wrap layout at 375px while exposing semantic old/current
  prices to assistive technology.
