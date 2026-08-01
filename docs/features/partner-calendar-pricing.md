# Partner calendar & pricing (Lịch & giá)

The **calendar tab** of a partner's listing (`/partner/listings/:id?tab=calendar`) — one grid where a
partner closes days, changes opening hours, and sets prices for a date, a weekday or an hour window.
Rebuilt 2026-07-31. Decisions: [ADR 0009](../decisions/0009-pricing-rule-scope-and-sale-campaigns.md).
Contracts: [`packages/contracts/src/contracts/listing.ts`](../../packages/contracts/src/contracts/listing.ts)
(pricing) and [`common.ts`](../../packages/contracts/src/contracts/common.ts) (calendar ranges).

## Data model

Two tenant-scoped tables, both already under RLS before this work — the migrations add columns and an
index, no new policy.

**`pricing_rules`** — `params` jsonb describes the scope, `price` is the rule's regular unit price,
`sale_price` an optional partner-funded discount valid only inside
`[sale_starts_at, sale_ends_at)` (booking-time), `campaign_label` its display name. A UNIQUE index
`pricing_rules_scope_key` on `(listing_id, booking_mode, rule_type, params)` gives one rule per
scope. `priority` orders overlapping rules (highest wins); the bands come from
`PRICING_RULE_PRIORITY` — 100 recurring / 500 `date_range` / 1000 `date_time_range`, narrowest wins —
which the **dashboard and seed apply**, not the API (the create schema defaults `priority` to `0`).

**`availability_exceptions`** — still one row per `(resource_id, date)`, but `custom_hours` now
carries `windows` jsonb (`[{ openTime, closeTime }]`), so a special day can break for lunch.
`open_time`/`close_time` remain as a mirror of `windows[0]` for readers predating the column.

Migrations: `20260731120000_availability_exception_windows`,
`20260731130000_pricing_rule_scope_unique`, `20260731140000_pricing_rule_sale_campaign`.

> The last of these shares its timestamp prefix with `20260731140000_tenant_legal_documents`. Apply
> order is still deterministic (folder names sort, `p` < `t`) and the two are independent, so this is
> harmless — but do not rename either: they are applied.

The full invariant list is in [`data-model.md`](../data-model.md) → *What is not in the schema*.

## Backend — `apps/api/src/modules/listing` + `modules/scheduling`

Pricing rules belong to `listing`, availability to `scheduling`.

`PreparePricingRuleWriteUseCase` is the shared write gate: overlap checks, the open-hours check for
hourly windows, and the replace-delete of the previous rule for the same scope. It takes the
caller's `tx` and never opens its own, because the checks and the insert must commit together. Both
the partner and the tenant create paths call it — the tenant path previously had none of these
checks, which is exactly how the two drifted.

The open-hours check needs scheduling's rows, but `scheduling` already imports `listing`, so
injecting its repositories back would close a module cycle. `OpenHoursReaderPort`
(`listing/domain/ports/open-hours-reader.port.ts`) keeps that read local; both sides still interpret
the rows through `shared/domain/availability/open-windows`, so nothing is duplicated.

`shared/domain/pricing/quote-calculator.ts` stays the single path from rules to money.
`activeSalePrice(rule, now)` is the one place a campaign window is judged, and `QuoteRequest.now` is
**required** — see ADR 0009 for why it has no default.

Endpoints (all `@RequirePermissions`; every partner **write** additionally carries
`@UseGuards(RequireActiveSubscriptionGuard, RequireCurrentAgreementGuard)` — the reads do not):

| Method | Path | Permission |
| --- | --- | --- |
| `GET` `POST` `DELETE` | `partner/listings/:listingId/pricing-rules[/:ruleId]` | `partner.listings.read` / `.write` |
| `POST` | `partner/listings/:listingId/pricing-rules/bulk` | `partner.listings.write` |
| `GET` `POST` `DELETE` | `partner/resources/:id/availability-exceptions[/:exceptionId]` | `partner.availability.manage` |
| `POST` `DELETE` | `partner/resources/:id/availability-exceptions/bulk` · `…/availability-exceptions` (range clear) | `partner.availability.manage` |

Errors: `PRICING_RULE_SCOPE_TAKEN` (409, from P2002 on the unique index), `PRICING_RULE_OVERLAP`,
`RECURRING_PRICING_RULE_OVERLAP`, `PRICING_WINDOW_OUTSIDE_OPEN_HOURS` (all 400).

Range reads are capped by `MAX_CALENDAR_RANGE_DAYS` (366) and bulk writes by
`MAX_BULK_CALENDAR_DAYS` (92) — a bulk write runs a row per date, a read does not.

### Public availability calendar projection

`GET /public/listings/:slug/availability` keeps the detailed response by default. Passing
`view=calendar` selects the month-summary projection for `hourly` or `daily` mode; `from` and `to`
remain inclusive date-only bounds and fixed-package requests also carry `packageId`. Inventory mode
does not support this view. Each returned day is `{ date, status, sale }`, where `status` is
`available`, `sold_out`, `closed`, or `blocked`, and `sale` is either `null` or one nested object with:

- `coverage: 'full' | 'partial'`;
- `minDiscountPercent` and `maxDiscountPercent`, calculated with the shared BigInt-safe half-up rule;
- distinct, trimmed `campaignLabels` in first-occurrence order.

For hourly availability, `full` means every currently available slot is discounted; if only some
available slots are discounted, coverage is `partial`. A date with no opening windows is `closed`,
while a date with generated slots but no available slot is `sold_out`. A discounted available daily
night is always `full`. Closed, blocked and sold-out days never expose a sale marker. The detailed
response and calendar projection are built from the same computed unit prices and captured `now`, so
the summary cannot invent a different price.

## Dashboard — `apps/dashboard/app/features/partner/`

`components/listing-calendar/` — `index.tsx` (grid + month/week toggle), `day-cell.tsx`,
`day-dialog.tsx` (one day: closure, opening windows, price), `range-dialog.tsx` (bulk over a date
span), `week-grid.tsx` (hour rows, hourly mode only), `window-list-field.tsx` (N opening windows),
`sale-campaign-fields.tsx`, `booking-warning.tsx` (shown when a change would affect days that already
hold bookings — it warns, it does not block).

All calendar arithmetic is pure and lives in `lib/listing-calendar.ts`, not in the components:
`calendarDays`, `closureStateOf`, `openWindowsFor`, `pricingRulesForCell`, `hasRecurringOn`,
`campaignPresentationOf`, `campaignRulesForCell`, `effectivePriceOf`, `weekHourRows`, `hourIsOpen`,
`ruleCoveringHour`,
`bucketBookingsByDay`, `holdsResource`.

The week view is guarded on the mode being *viewed* (`mode === 'hourly'`), not on the listing merely
supporting hourly — a dual-mode listing in daily view must not render an hour grid.

Month cells use the same C3 semantics as the customer calendar: solid warning treatment for full
coverage, diagonal warning treatment for partial coverage, an exact percentage only for one full
rate, and a flame for partial or multi-rate full coverage. Running campaigns can show their sale
price; scheduled and ended campaigns retain the regular price and add a lifecycle badge instead.
The hour grid resolves the effective rule by priority before showing an exact struck-through/current
pair, so a shadowed campaign is never presented as customer-visible.

Day, range and recurring pricing forms expose an explicit `Bật giá ưu đãi` toggle and mount the
shared `CampaignPreview` below the campaign fields. The preview is labelled `Khách hàng sẽ thấy` and
uses the regular price, sale price, campaign name/fallback, rule scope and booking deadline. Invalid
or incomplete prices render the neutral `Nhập giá ưu đãi để xem trước` state rather than a fabricated
percentage. Calendar cells, saved recurring rows and the preview all distinguish running,
scheduled and ended campaigns.

## Storefront — `apps/storefront/app/`

### Discovery, exact prices and C3 calendar

Undated listing cards and detail banners consume `SaleCampaignSummary`, which is descriptive and
therefore say `Giảm đến X%` / `Up to X% off`. Only a real dated search, detailed slot/night, or quote
may show an exact percentage and struck-through/current prices. The configured “from” price is never
silently turned into an exact campaign price.

The booking dialog calls the localized Storefront resource routes
`/:locale/l/:listingSlug/sale-calendar` and
`/:locale/g/:groupSlug/rooms/:listingSlug/sale-calendar`. Their thin route modules delegate to
`loadListingSaleCalendarRoute()`, which validates listing/group membership, mode, literal month and
fixed-package selection, then calls the API server-to-server with `view=calendar`. The browser's
dedicated `useBookingSaleCalendar()` fetcher keys responses by mode/month/package, while the existing
detailed-availability fetcher remains the source of selectable dates and slots.

Customer month cells render the C3 full/partial states described above and preserve selection/focus
cues. Detailed slots and nightly hints use exact `regularPrice`, `price` and `campaignLabel`; totals
still come only from the server quote. When the summary resource fails, the detailed calendar stays
usable without sale markers, and a localized warning with retry is added without disabling dates or
clearing the current selection.

### Quote and checkout separation

`lib/quote.ts` → `campaignLabelsOf(quote)` returns the distinct campaign names a quote is discounted
by, read from `lineItems[]` because that is the only place the name exists — one booking can span
hours priced by different campaigns.

- `features/checkout/components/price-panel.tsx` presents `Giá ưu đãi theo lịch` / `Calendar sale
  price` first, with distinct partner campaign labels (or the translated unnamed fallback), then
  `Ưu đãi thanh toán` / `Checkout promotion` for the selected promotion code or auto-promotion.
- `features/booking-widget/components/booking-panel-presentation.tsx` — `Breakdown` badges each line
  individually and compares that line's `regularAmount` with `amount`. Note its actual reach:
  `BookingPanel` renders only when
  `supportsScheduledBooking(listing.bookingModes)` is **false**, so an `hourly`/`daily` listing gets
  `ScheduledBookingCard` and its dialog instead. In practice `Breakdown` is the **inventory**
  listing's surface. Inventory still prices per time-unit through `matchingRule`, so a multi-day
  rental spanning two campaigns does show two differently-badged lines.

Campaign labels are partner-authored text already in the tenant's language: rendered verbatim, never
translated. Only the no-name fallback goes through i18n. Calendar pricing is already reflected in
the quoted subtotal; checkout promotion validation receives that subtotal and applies afterward.
When a customer supplies a code, the Storefront resolves only that code; without a code, its
server-side checkout loader previews the name of the best code-less auto-campaign as a conditional
offer. Because that identity-free preview cannot evaluate first-booking or per-customer limits, it
does not change the displayed final amount, deposit or due-now amount. The booking use-case resolves
the winner and monetary result authoritatively inside its transaction, including customer-specific
limits. The two names are never merged, code-over-auto precedence remains unchanged, and this
presentation adds no stacking behavior.

## Known limits

- A campaign expiring changes the price with no database write, so nothing invalidates
  `RedisAvailabilityCache` (TTL 60s) — a stale sale can be **displayed** for up to a minute. Nobody
  is charged it: the booking path re-prices against a live clock and `assertExpectedSubtotal`
  rejects a mismatch.
- A missing/blank partner campaign name falls back to localized `Đang giảm giá` / `On sale` on public
  surfaces; raw empty labels are never fabricated into API campaign names.
- Recurring rules share one priority band, so an ambiguous pair is refused at write time rather than
  ranked at read time.
