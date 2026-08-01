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

## Dashboard — `apps/dashboard/app/features/partner/`

`components/listing-calendar/` — `index.tsx` (grid + month/week toggle), `day-cell.tsx`,
`day-dialog.tsx` (one day: closure, opening windows, price), `range-dialog.tsx` (bulk over a date
span), `week-grid.tsx` (hour rows, hourly mode only), `window-list-field.tsx` (N opening windows),
`sale-campaign-fields.tsx`, `booking-warning.tsx` (shown when a change would affect days that already
hold bookings — it warns, it does not block).

All calendar arithmetic is pure and lives in `lib/listing-calendar.ts`, not in the components:
`calendarDays`, `closureStateOf`, `openWindowsFor`, `pricingRulesForCell`, `hasRecurringOn`,
`campaignState`, `effectivePriceOf`, `weekHourRows`, `hourIsOpen`, `ruleCoveringHour`,
`bucketBookingsByDay`, `holdsResource`.

The week view is guarded on the mode being *viewed* (`mode === 'hourly'`), not on the listing merely
supporting hourly — a dual-mode listing in daily view must not render an hour grid.

## Storefront — `apps/storefront/app/`

`lib/quote.ts` → `campaignLabelsOf(quote)` returns the distinct campaign names a quote is discounted
by, read from `lineItems[]` because that is the only place the name exists — one booking can span
hours priced by different campaigns.

- `features/checkout/components/price-panel.tsx` — the sale badge shows those names joined by `·`,
  falling back to the translated `checkout.saleBadge`.
- `features/booking-widget/components/booking-panel-presentation.tsx` — `Breakdown` badges each line
  individually. Note its actual reach: `BookingPanel` renders only when
  `supportsScheduledBooking(listing.bookingModes)` is **false**, so an `hourly`/`daily` listing gets
  `ScheduledBookingCard` and its dialog instead. In practice `Breakdown` is the **inventory**
  listing's surface. Inventory still prices per time-unit through `matchingRule`, so a multi-day
  rental spanning two campaigns does show two differently-badged lines.

Campaign labels are partner-authored text already in the tenant's language: rendered verbatim, never
translated. Only the no-name fallback goes through i18n.

## Known limits

- A campaign expiring changes the price with no database write, so nothing invalidates
  `RedisAvailabilityCache` (TTL 60s) — a stale sale can be **displayed** for up to a minute. Nobody
  is charged it: the booking path re-prices against a live clock and `assertExpectedSubtotal`
  rejects a mismatch.
- Recurring rules share one priority band, so an ambiguous pair is refused at write time rather than
  ranked at read time.
