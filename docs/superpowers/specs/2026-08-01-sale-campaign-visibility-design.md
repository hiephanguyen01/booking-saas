# Sale campaign visibility across Storefront and partner pricing

**Approved:** 2026-08-01
**Visual direction:** C3 — strong marketing with truthful, layered calendar signals

## Goal

Make calendar-priced sales immediately visible and understandable everywhere a customer chooses a
listing, date, time, or checkout option. Keep calendar sales distinct from promotion codes, and give
partners a matching preview of what customers will see.

This design completes the uncommitted sale-campaign work already present in the workspace. It does
not replace the pricing model from ADR 0009: a campaign window is evaluated at booking time, while
pricing-rule scope determines which service dates and times receive the sale price.

## Product language

Two discount mechanisms remain visibly separate:

- **Giá ưu đãi theo lịch / Calendar sale price:** the partner-funded `salePrice` attached to a
  pricing rule. It changes the unit price before checkout promotions.
- **Ưu đãi thanh toán / Checkout promotion:** a promotion code or code-less auto-promotion applied
  after the calendar-priced subtotal.

Partner-authored campaign labels are displayed verbatim. All surrounding Storefront text is
bilingual through `@booking/i18n`; the Dashboard remains Vietnamese-only.

## Customer experience

### Discovery surfaces

Home, catalog, search, favorites, recent listings, provider profiles, related listings, and listing
groups use the same campaign presentation:

- A high-contrast sale ribbon on the image says **“Giảm đến X%”** when no concrete booking window
  has been priced.
- The campaign badge shows its name, booking deadline/countdown, and a compact schedule such as
  **“T2–T6 · 09:00–15:00”** when the schedule is unambiguous.
- A dated search may show an exact `−X%`, struck-through regular price, and discounted price only
  when the searched window was actually priced.
- A varied campaign schedule says **“Nhiều khung thời gian · Xem lịch”** rather than publishing a
  partial or inferred schedule.

The listing detail repeats the campaign in a prominent C3 banner immediately above the booking
controls. It keeps the configured “from” price until the customer chooses a real date/time.

### Calendar and slot treatment

The calendar never uses color as its only signal:

- **Solid orange + exact percentage:** every currently available unit on that date is discounted by
  the same percentage.
- **Solid orange + flame:** every available unit is discounted, but by multiple percentages.
- **Diagonal orange + flame:** only some available hours are discounted.
- Closed, blocked, and sold-out dates receive no sale treatment even if a pricing rule covers them.
- A legend explains “Giảm cả ngày” and “Có giờ ưu đãi”; accessible labels include the same meaning.

An available discounted time slot shows the regular price struck through, the sale price in strong
orange, the exact percentage, and the campaign label. Selected styling remains visible without
hiding the sale state. Daily bookings use the same old-price/new-price treatment for each available
night. Inventory bookings have no sale calendar; their exact quote and checkout breakdown continue
to expose applicable campaign labels.

### Quote and checkout

The quote breakdown names each calendar campaign on the line it discounted. Checkout presents two
separate rows/sections in pricing order:

1. **Giá ưu đãi theo lịch** — already reflected in the quoted subtotal.
2. **Ưu đãi thanh toán** — promotion code or auto-promotion applied afterward.

This separation does not introduce new stacking or precedence rules; it only explains the existing
calculation truthfully.

## Partner Dashboard

The partner calendar calls the feature **“Chiến dịch giá ưu đãi”**, leaving **“Mã khuyến mãi”** for
the promotions module.

- Month and week views reuse the C3 solid/diagonal/flame language and add `Đang chạy`, `Sắp diễn ra`,
  and `Đã kết thúc` status badges.
- Calendar cells and hourly rows show regular and sale prices without hiding the underlying regular
  rule after a campaign ends.
- Pricing forms group regular price, the sale toggle, sale price, campaign name, and booking-time
  campaign start/end. Helper copy explicitly says the campaign window is judged when the customer
  books, not when the service is consumed.
- The form includes a “Khách hàng sẽ thấy” preview with the customer-facing ribbon, campaign label,
  schedule, and deadline.
- Rules sharing a campaign name are summarized only when their schedule is consistent. Mixed scopes
  render “Nhiều khung thời gian” and direct the partner to the calendar.

## Public contracts and data flow

The existing `GET /public/listings/:slug/availability` endpoint gains an optional
`view=calendar`. Omitting it preserves the current response and client behavior. The calendar view
accepts the existing `mode`, `from`, `to`, and optional `packageId` inputs and returns:

```ts
interface AvailabilityCalendarResponse {
  view: 'calendar';
  mode: 'hourly' | 'daily';
  timezone: string;
  days: Array<{
    date: string;
    status: 'available' | 'sold_out' | 'closed' | 'blocked';
    sale: null | {
      coverage: 'full' | 'partial';
      minDiscountPercent: number;
      maxDiscountPercent: number;
      campaignLabels: string[];
    };
  }>;
}
```

For hourly mode, a day is `full` only when every available slot is discounted; otherwise it is
`partial`. A date with no open slots is `closed`, and a date with generated slots but none currently
available is `sold_out`. Daily mode compares the night's `regularPrice` and `price`; a discounted
available night is always `full`.

The existing availability and quote kernels remain the single source of price truth. Calendar
summaries are projections of computed `price`, `regularPrice`, and `campaignLabel`, using BigInt-safe
percentage calculation and the same captured `now` as the detailed response. The Storefront requests
one calendar month through its server-side loader/resource route, then requests detailed slots only
for the selected day. Fixed-package summaries include the selected `packageId`.

The existing `SaleCampaignSummary` continues to power undated cards and detail banners. Its schedule
is descriptive only; it never overrides the exact availability-calendar result.

## Failure and boundary behavior

- If the calendar-summary request fails, date selection remains usable without sale markers and an
  unobtrusive localized warning explains that promotional indicators are unavailable.
- A campaign with no usable name falls back to the localized “Đang giảm giá”.
- Multiple campaign labels on one day are deduplicated; detailed slots and quote lines retain their
  exact labels.
- Dates and countdowns are resolved in the listing/resource timezone to avoid SSR hydration drift.
- Availability cache may display a campaign boundary up to 60 seconds late, as accepted by ADR 0009.
  Booking creation always reprices against the live clock and rejects a stale expected subtotal.
- Tenant theme tokens supply colors and foreground contrast; icon/text cues preserve meaning for
  color-vision and screen-reader users.

## Verification

No automated test files or test configuration will be added, per ADR 0005. Verification consists of:

- The repository full static check (`check:no-tests`, module-cycle and frontend-structure guards,
  Storefront security, lint, typecheck, build, and RLS coverage).
- Manual Storefront flows in Vietnamese and English for undated cards, dated search, listing detail,
  hourly partial-day sales, hourly full-day sales, daily sales, multiple rates, sold-out/closed dates,
  quote, and checkout promotion separation.
- Manual partner flows for running, scheduled, ended, unnamed, mixed-schedule, and fixed-package
  campaigns in month/week views and the customer preview.
- Mobile-width and keyboard/screen-reader checks for legends, day labels, slots, selected states,
  popovers, and graceful summary failure.

## Scope boundaries

- No change to pricing precedence, promotion stacking, commission, funding, or booking-time campaign
  semantics.
- No redesign of platform-admin, tenant, or affiliate dashboards in this iteration.
- No sale-calendar treatment for inventory mode; its quote-line visibility remains in scope.
- No new database migration is required for this visibility work.
