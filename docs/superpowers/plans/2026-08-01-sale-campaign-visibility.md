# Sale Campaign Visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the in-progress sale-campaign propagation and deliver the approved C3 experience across every customer discovery/booking surface and the partner pricing calendar.

**Architecture:** Keep `computeQuote` and `GetAvailabilityUseCase` as the only price truth. Undated surfaces consume `SaleCampaignSummary`; calendar surfaces request a compact `view=calendar` projection; selected dates and slots continue to consume exact availability/quote data through Storefront server resource routes. Dashboard changes are presentation-only over existing pricing-rule contracts.

**Tech Stack:** NestJS 11, Prisma 6, Zod contracts, React Router 8 SSR/resource routes, React 19, Tailwind CSS v4, shadcn/ui, i18next, pnpm 10.13.1, Node 22.22.0.

## Global Constraints

- Preserve all existing uncommitted Claude work; never reset, discard, or rewrite unrelated changes.
- Add no `*.spec.*`, `*.test.*`, e2e files, test configs, test scripts, or CI test steps (ADR 0005).
- Backend flow remains controller → use-case → repository port → repository; do not add service classes.
- `GetAvailabilityUseCase` keeps exactly one exported injectable class and one public `execute()`.
- All tenant reads stay inside one `TenantDbService.forTenant()` transaction per operation.
- Frontends call the API only from loaders/resource routes; browser components never call the backend directly.
- Money stays VND digit strings/BigInt; percentages are integer 0–100; timestamps are UTC and calendar labels use the resource timezone.
- Use theme tokens (`warning`, `warning-foreground`, `primary`, `ring`) rather than literal orange/emerald colors.
- Storefront copy is Vietnamese/English via `@booking/i18n`; Dashboard copy is Vietnamese-hardcoded.
- Campaign labels are partner-authored and displayed verbatim; only fallback and explanatory text are translated.
- Static/manual verification replaces TDD because the repository owner prohibits automated tests.

---

### Task 1: Stabilize the existing campaign projection and discovery contract

**Files:**
- Create/finish: `apps/api/src/shared/domain/pricing/sale-campaign.ts`
- Create/finish: `apps/storefront/app/lib/sale-campaign.ts`
- Create/finish: `apps/storefront/app/components/sale-campaign-badge.tsx`
- Modify: `packages/contracts/src/contracts/common.ts`
- Modify: `packages/contracts/src/contracts/catalog-search.ts`
- Modify: `packages/contracts/src/contracts/listing-type.ts`
- Modify: `packages/contracts/src/contracts/listing.ts`
- Modify: `apps/api/src/modules/catalog/application/use-cases/search-public-catalog.use-case.ts`
- Modify: `apps/api/src/modules/favorites/application/favorite.mapper.ts`
- Modify: `apps/api/src/modules/favorites/domain/ports/favorite-reader.port.ts`
- Modify: `apps/api/src/modules/favorites/infrastructure/repositories/prisma-favorite.repository.ts`
- Modify: `apps/api/src/modules/listing/application/listing.mapper.ts`
- Modify: `apps/api/src/modules/listing/application/use-cases/get-public-listing.use-case.ts`
- Modify: `apps/api/src/modules/listing/application/use-cases/get-public-listing-group.use-case.ts`
- Modify: `apps/api/src/modules/listing/domain/ports/pricing-rule-repository.port.ts`
- Modify: `apps/api/src/modules/listing/infrastructure/http/public-listing.controller.ts`
- Modify: `apps/api/src/modules/listing/infrastructure/repositories/prisma-pricing-rule.repository.ts`
- Modify: `apps/storefront/app/features/catalog/server/catalog.server.ts`
- Modify: `apps/storefront/app/features/search/lib/search-state.ts`
- Modify: `packages/i18n/src/locales/vi/listing.ts`
- Modify: `packages/i18n/src/locales/en/listing.ts`

**Interfaces:**
- Produces: `SaleSchedule`, `SaleCampaignSummary`, `summarizeSaleCampaign()`, `discountPercent()`, `campaignHeadlinePercent()`, and `SaleCampaignBadge`.
- Preserves: `SaleCampaignSummary` always describes one winning live campaign and never claims an exact bookable price.

- [ ] **Step 1: Review and normalize the in-progress contract and kernel instead of recreating them.**

Keep these public shapes and signatures consistent between `@booking/contracts` and the API kernel:

```ts
export interface SaleSchedule {
  weekdays: number[];
  timeFrom: string | null;
  timeTo: string | null;
  dateFrom: string | null;
  dateTo: string | null;
  varies: boolean;
}

export interface SaleCampaignSummary {
  label: string | null;
  discountPercent: number;
  lastBookingDate: string | null;
  daysLeft: number | null;
  schedule: SaleSchedule | null;
}

export function summarizeSaleCampaign(
  rules: readonly CampaignRuleView[],
  now: Date,
  timezone: string,
  mode?: BookingMode,
): SaleCampaignSummary | null;
```

The winning campaign is the deepest live discount, then a named campaign, then the campaign ending sooner. Every returned display field must come from that winner and the rules sharing its normalized label.

- [ ] **Step 2: Finish API propagation on catalog, listing detail/group, and favorites.**

Capture `const now = utcNow()` once per use-case execution. Fetch pricing rules in the existing tenant transaction, summarize with the listing resource timezone, and map `campaign: summary ?? null` into every public listing/card child. Do not expose raw pricing rules or `salePrice` on public discovery contracts.

- [ ] **Step 3: Finish the shared Storefront presentation helpers.**

Keep exact-versus-ceiling logic centralized:

```ts
export function discountPercent(regularPrice: string, salePrice: string): number | null;

export function campaignHeadlinePercent(
  campaign: SaleCampaignSummary | null,
  pricedPercent: number | null,
): { percent: number; exact: boolean } | null;
```

Extend `SaleCampaignBadge` so an unambiguous schedule renders in this order: localized weekday list, clock band, calendar span. When `schedule.varies` is true, render the localized `Nhiều khung thời gian · Xem lịch`. Preserve countdown wording based only on API-provided `daysLeft`/`lastBookingDate` to avoid hydration drift.

- [ ] **Step 4: Add the exact bilingual copy keys used by the badge and later calendar UI.**

Add matching Vietnamese/English keys under `listing.campaign` for: unnamed sale, up-to discount, book-by date, days left, last day, varied schedule, all-day sale, partial-day sale, exact percent, calendar-unavailable warning, regular price, sale price, and calendar-sale/checkout-promotion headings.

- [ ] **Step 5: Verify the foundation before committing.**

Run:

```bash
pnpm --filter=@booking/contracts build
pnpm --filter=@booking/api typecheck
pnpm --filter=@booking/storefront typecheck
pnpm check:module-cycles
```

Expected: every command exits 0; no route returns a contract shape missing `campaign`.

- [ ] **Step 6: Commit the campaign projection foundation.**

```bash
git add packages/contracts/src/contracts/common.ts packages/contracts/src/contracts/catalog-search.ts packages/contracts/src/contracts/listing-type.ts packages/contracts/src/contracts/listing.ts packages/i18n/src/locales/vi/listing.ts packages/i18n/src/locales/en/listing.ts apps/api/src/shared/domain/pricing/sale-campaign.ts apps/api/src/modules/catalog apps/api/src/modules/favorites apps/api/src/modules/listing apps/storefront/app/lib/sale-campaign.ts apps/storefront/app/components/sale-campaign-badge.tsx apps/storefront/app/features/catalog/server/catalog.server.ts apps/storefront/app/features/search/lib/search-state.ts
git commit -m "feat: expose sale campaigns across storefront discovery"
```

### Task 2: Add the compact availability calendar projection

**Files:**
- Create: `apps/api/src/shared/domain/availability/calendar-sale-summary.ts`
- Modify: `packages/contracts/src/contracts/availability.ts`
- Modify: `apps/api/src/modules/scheduling/application/use-cases/get-availability.use-case.ts`
- Modify: `apps/api/src/modules/scheduling/infrastructure/http/dto/scheduling.dto.ts`
- Modify: `apps/api/src/modules/scheduling/infrastructure/http/public-availability.controller.ts`
- Modify: `apps/api/src/modules/scheduling/domain/ports/availability-cache.port.ts`
- Modify: `apps/api/src/modules/scheduling/infrastructure/redis-availability-cache.ts`
- Modify: `apps/api/src/shared/domain/availability/day-availability.ts`
- Modify: `apps/api/src/shared/domain/availability/slot-generator.ts`
- Modify: `apps/api/src/shared/domain/pricing/quote-calculator.ts`

**Interfaces:**
- Consumes: exact `price`, `regularPrice`, and optional `campaignLabel` from generated hourly slots/daily nights.
- Produces: `AvailabilityCalendarResponse` and `summarizeAvailabilityCalendar()`.

- [ ] **Step 1: Extend the query and response contracts without breaking detail callers.**

Add `view: z.enum(['detail', 'calendar']).default('detail')` to `availabilityQuerySchema`. Reject `{ mode: 'inventory', view: 'calendar' }` during `superRefine`. Keep `availabilityResponseSchema` unchanged and add:

```ts
export const availabilityCalendarStatusSchema = z.enum([
  'available',
  'sold_out',
  'closed',
  'blocked',
]);

export const availabilityCalendarSaleSchema = z.object({
  coverage: z.enum(['full', 'partial']),
  minDiscountPercent: z.number().int().min(1).max(100),
  maxDiscountPercent: z.number().int().min(1).max(100),
  campaignLabels: z.array(z.string()),
});

export const availabilityCalendarResponseSchema = z.object({
  view: z.literal('calendar'),
  mode: z.enum(['hourly', 'daily']),
  timezone: z.string(),
  days: z.array(z.object({
    date: dateOnlySchema,
    status: availabilityCalendarStatusSchema,
    sale: availabilityCalendarSaleSchema.nullable(),
  })),
});
```

Export inferred types and `availabilityEndpointResponseSchema = z.union([availabilityResponseSchema, availabilityCalendarResponseSchema])` for the Nest response DTO.

- [ ] **Step 2: Complete exact unit-price propagation already started in the workspace.**

Keep this shared type in `quote-calculator.ts` and ensure slot generation, daily computation, Redis cache serialization, and `GetAvailabilityUseCase` all preserve it:

```ts
export interface UnitPrice {
  price: string;
  regularPrice: string;
  campaignLabel?: string;
}
```

Use `quote.subtotal` as `price` and `quote.regularSubtotal` as `regularPrice`. A cache row written before the new fields must fall back to `regularPrice: cached.price`; absence of `campaignLabel` means no named campaign.

- [ ] **Step 3: Implement the pure calendar summarizer.**

Create:

```ts
export function summarizeAvailabilityCalendar(
  detail: Extract<AvailabilityResponse, { mode: 'hourly' | 'daily' }>,
): AvailabilityCalendarResponse;
```

For hourly days, derive status and sale from available slots only:

```ts
const open = day.slots;
const available = open.filter((slot) => slot.available);
const discounted = available.filter((slot) => BigInt(slot.regularPrice) > BigInt(slot.price));
```

Map `open.length === 0` to `closed`, `available.length === 0` to `sold_out`, and otherwise `available`. Set `coverage: 'full'` only when `discounted.length === available.length`; otherwise `partial`. Calculate every percentage with the shared half-up BigInt formula, return the min/max, and return trimmed distinct non-empty campaign labels in first-occurrence order.

For daily days, map `booked` to `sold_out`, preserve `closed`/`blocked`, and emit a `full` sale only when the day is `available` and both prices are non-null with `regularPrice > price`.

- [ ] **Step 4: Make `GetAvailabilityUseCase` return either detail or calendar view from one captured clock.**

Change the return type to:

```ts
Promise<AvailabilityResponse | AvailabilityCalendarResponse>
```

Build the detailed hourly/daily response exactly once inside the existing `forTenant()` callback, then return:

```ts
return query.view === 'calendar'
  ? summarizeAvailabilityCalendar(detail)
  : detail;
```

Do not open a second tenant transaction, do not call the use-case recursively, and do not create a second pricing path.

- [ ] **Step 5: Update HTTP typing/OpenAPI and verify.**

Point `AvailabilityResponseDto` at `availabilityEndpointResponseSchema` and update the controller return annotation to the union. Run:

```bash
pnpm --filter=@booking/contracts build
pnpm --filter=@booking/api typecheck
pnpm --filter=@booking/api lint
pnpm check:module-cycles
```

Expected: all commands exit 0; `view=detail` remains the default and `inventory+calendar` is rejected by validation.

- [ ] **Step 6: Commit the availability projection.**

```bash
git add packages/contracts/src/contracts/availability.ts apps/api/src/shared/domain/availability apps/api/src/shared/domain/pricing/quote-calculator.ts apps/api/src/modules/scheduling
git commit -m "feat: add compact sale availability calendar"
```

### Task 3: Add the Storefront month-summary resource flow

**Files:**
- Create: `apps/storefront/app/features/booking-widget/lib/sale-calendar.ts`
- Create: `apps/storefront/app/features/booking-widget/server/listing-sale-calendar.server.ts`
- Create: `apps/storefront/app/features/booking-widget/hooks/use-booking-sale-calendar.ts`
- Create: `apps/storefront/app/routes/listing-sale-calendar.tsx`
- Create: `apps/storefront/app/routes/listing-group-sale-calendar.tsx`
- Modify: `apps/storefront/app/features/booking/server/booking.server.ts`
- Modify: `apps/storefront/app/constants/paths.ts`
- Modify: `apps/storefront/app/routes.ts`
- Modify: `apps/storefront/app/features/booking-widget/hooks/use-booking-dialog-controller.ts`

**Interfaces:**
- Consumes: `AvailabilityCalendarResponse` from Task 2.
- Produces: `loadListingSaleCalendarRoute()` and `useBookingSaleCalendar()` for both standalone listings and listing-group rooms.

- [ ] **Step 1: Add month helpers with literal date arithmetic.**

In `sale-calendar.ts`, implement:

```ts
export function monthOf(date: string): string;
export function monthBounds(month: string): { from: string; to: string };
export function calendarDaysByDate(
  response: AvailabilityCalendarResponse | null,
): ReadonlyMap<string, AvailabilityCalendarDay>;
```

Accept only `YYYY-MM`; derive the first/last `YYYY-MM-DD` with UTC calendar arithmetic. Do not parse date-only values in the viewer timezone.

- [ ] **Step 2: Add the typed server API adapter.**

In `booking.server.ts`, add:

```ts
export function fetchAvailabilityCalendar(
  request: Request,
  slug: string,
  query: {
    mode: Extract<AvailabilityMode, 'hourly' | 'daily'>;
    from: string;
    to: string;
    packageId?: string;
  },
): Promise<AvailabilityCalendarResponse>;
```

Send `view=calendar` and parse with `availabilityCalendarResponseSchema`.

- [ ] **Step 3: Add one shared resource loader and two thin route adapters.**

`loadListingSaleCalendarRoute(request, url, listingSlug, groupSlug?)` must fetch the public listing, verify group membership when `groupSlug` is present, validate `mode`, `month`, and fixed `packageId`, call `monthBounds()`, then return:

```ts
{ ok: true as const, mode, month, packageId: packageId ?? null, calendar }
```

Return the existing `invalid-request`, `room-not-found`, and `availability-unavailable` error conventions with 400/404/502. Route files export only `loader`; register localized standalone and group-room paths next to their existing booking-data routes.

- [ ] **Step 4: Add stable path builders and the dedicated hook.**

Add:

```ts
listingSaleCalendar(locale, listingSlug)
listingGroupRoomSaleCalendar(locale, groupSlug, listingSlug)
```

`useBookingSaleCalendar()` owns a separate `useFetcher`, initial month `monthOf(today)`, response matching by `mode/month/packageId`, and exposes:

```ts
{
  month: string;
  calendar: AvailabilityCalendarResponse | null;
  pending: boolean;
  error: boolean;
  loadMonth(month: string): void;
  reload(): void;
}
```

Load the initial month when a booking dialog opens. Reload on booking mode or fixed-package change; never clear selected detailed availability just because the calendar fetcher changes state.

- [ ] **Step 5: Integrate the hook into `useBookingDialogController`.**

Pass `calendar`, `calendarPending`, `calendarError`, `calendarMonth`, `onCalendarMonthChange`, and `onRetryCalendar` through the controller result. Keep the existing detailed availability fetcher and quote matching unchanged.

- [ ] **Step 6: Verify resource-route isolation and commit.**

Run:

```bash
pnpm check:frontend-structure
pnpm --filter=@booking/storefront security
pnpm --filter=@booking/storefront typecheck
pnpm --filter=@booking/storefront lint
```

Expected: all commands exit 0; browser-reachable modules have no runtime import from a `*.server.ts` file.

```bash
git add apps/storefront/app/features/booking apps/storefront/app/features/booking-widget apps/storefront/app/constants/paths.ts apps/storefront/app/routes.ts apps/storefront/app/routes/listing-sale-calendar.tsx apps/storefront/app/routes/listing-group-sale-calendar.tsx
git commit -m "feat: load monthly sale availability in storefront"
```

### Task 4: Render the C3 calendar, slots, and exact sale prices

**Files:**
- Create: `apps/storefront/app/features/booking-widget/components/sale-calendar-day-button.tsx`
- Create: `apps/storefront/app/features/booking-widget/components/sale-calendar-legend.tsx`
- Create: `apps/storefront/app/components/sale-price.tsx`
- Modify: `apps/storefront/app/features/booking-widget/components/booking-dialog-steps.tsx`
- Modify: `apps/storefront/app/features/booking-widget/hooks/use-booking-dialog-steps-controller.ts`
- Modify: `apps/storefront/app/features/booking-widget/components/booking-panel-hourly-picker.tsx`
- Modify: `apps/storefront/app/features/booking-widget/components/booking-panel-daily-picker.tsx`
- Modify: `apps/storefront/app/features/booking-widget/components/slot-picker.tsx`
- Modify: `apps/storefront/app/features/listing-group/components/room-cells.tsx`
- Modify: `apps/storefront/app/lib/availability.ts`

**Interfaces:**
- Consumes: calendar hook fields from Task 3 and exact `HourlySlot`/`DayAvailability` unit prices from Task 2.
- Produces: reusable `SalePrice`, `SaleCalendarDayButton`, and `SaleCalendarLegend`.

- [ ] **Step 1: Implement reusable exact-price presentation.**

`SalePrice` accepts `{ price, regularPrice, campaignLabel?, compact? }`. If `regularPrice <= price`, render only the normal formatted price. Otherwise render regular price struck through, sale price in `text-warning-foreground`, and `−N%` using `discountPercent()`. Render the label only when non-empty.

- [ ] **Step 2: Implement the custom day button using the exported UI base.**

Wrap `CalendarDayButton` from `@booking/ui/components/ui/calendar`. Look up the literal date in `calendarDaysByDate`. Apply:

- `border-warning/50 bg-warning/15 text-warning-foreground` for `coverage='full'`.
- A theme-token diagonal background for `coverage='partial'`.
- `−N%` only when full and `minDiscountPercent === maxDiscountPercent`.
- A `Flame` icon for partial or multi-rate full dates.
- No sale class or icon unless `status === 'available'`.

Append localized sale coverage and percent range to `aria-label`; preserve all selection/range/focus props passed by React DayPicker.

- [ ] **Step 3: Wire the month calendar into both hourly and daily booking steps.**

Pass `month={dateOnlyToLocal(calendarMonth + '-01')}`, `onMonthChange`, and `components={{ DayButton: SaleCalendarDayButton }}` to each `Calendar`. Render `SaleCalendarLegend` directly below the calendar. When `calendarError` is true, render the localized warning and a retry button while leaving all dates selectable through existing detailed availability logic.

- [ ] **Step 4: Replace plain slot prices on every slot surface.**

Use `SalePrice` in:

- the main hourly toggle grid;
- listing-group `SlotPicker` rows;
- `BookingSlotGrid` inside the step dialog;
- room price cells when a searched interval has exact regular/sale totals.

Discounted slots get `border-warning/50 bg-warning/10`; selected state keeps `ring-primary` and primary selection semantics. Disabled/sold-out slots never receive a promotional background.

- [ ] **Step 5: Present exact daily sale totals after selection.**

Use daily `price`/`regularPrice` for day/range selection hints, and keep the quote as the final multi-night truth. Do not sum date-cell hints in the browser. A multi-night quote with different campaigns continues to name campaigns per line.

- [ ] **Step 6: Verify responsive and accessible rendering, then commit.**

Run:

```bash
pnpm --filter=@booking/storefront lint
pnpm --filter=@booking/storefront typecheck
pnpm --filter=@booking/storefront build
pnpm --filter=@booking/storefront security
pnpm check:frontend-structure
```

Manually check keyboard focus, selected sale dates, selected sale slots, the full/partial legend, a sold-out date, calendar-summary failure, and 375px width in both locales.

```bash
git add apps/storefront/app/components/sale-price.tsx apps/storefront/app/features/booking-widget apps/storefront/app/features/listing-group/components/room-cells.tsx apps/storefront/app/lib/availability.ts
git commit -m "feat: highlight sale dates and time slots"
```

### Task 5: Synchronize discovery, detail, and listing-group campaign UI

**Files:**
- Create: `apps/storefront/app/components/sale-campaign-banner.tsx`
- Modify: `apps/storefront/app/components/sale-campaign-badge.tsx`
- Modify: `apps/storefront/app/features/catalog/components/listing-card.tsx`
- Modify: `apps/storefront/app/features/catalog/components/search-result-card.tsx`
- Modify: `apps/storefront/app/features/listing/components/scheduled-booking-card.tsx`
- Modify: `apps/storefront/app/features/listing-group/components/listing-group-page.tsx`
- Modify: `apps/storefront/app/features/listing-group/components/room-cells.tsx`
- Modify: `apps/storefront/app/features/listing-group/components/room-options-section.tsx`
- Modify: `apps/storefront/app/features/listing-group/lib/listing-group-types.ts`
- Modify: `apps/storefront/app/features/listing-group/server/listing-group-route.server.ts`

**Interfaces:**
- Consumes: `SaleCampaignSummary`, `SaleCampaignBadge`, `campaignHeadlinePercent()`, and exact searched prices.
- Produces: one consistent C3 campaign banner/ribbon system across every public listing surface.

- [ ] **Step 1: Build the C3 detail banner.**

`SaleCampaignBanner` accepts `campaign`, optional exact percent, and optional compact mode. Render with `border-warning/40 bg-warning/10`, `Flame`, campaign label/fallback, `Giảm đến X%` or exact `−X%`, schedule, and countdown/deadline. Return `null` when campaign is null and no exact discount exists.

- [ ] **Step 2: Normalize card ribbons and badges.**

Home/catalog/favorites/recent/provider/related cards all inherit `ListingCard`; keep one ribbon implementation there. Search results use the same helper and classes. Undated cards say `Giảm đến X%`; dated search cards use exact `−X%` only when `regularPriceFrom > priceFrom`. Replace existing success-green sale styling with warning tokens to match C3.

- [ ] **Step 3: Put the banner immediately above scheduled booking controls.**

In `ScheduledBookingCard`, show the banner, configured from-price, and the booking CTA. Remove duplicate campaign text so the name, schedule, urgency, and discount are stated once.

- [ ] **Step 4: Surface campaigns on listing-group room browsing.**

Carry each child `campaign` into `RoomOption`. In browse state, render `SaleCampaignBadge` beside the room title and `Giảm đến X%` near its from-price. In a dated/ranged state, show exact struck-through and sale totals only from the priced room option; do not substitute the group's deepest campaign for a specific room.

For the group-level aside, select the campaign belonging to the room that produced `minimumRoomPrice`; if no single priced room wins, omit the group banner and rely on room cards.

- [ ] **Step 5: Remove stale documentation comments and verify all discovery routes.**

Delete the `Promotions remain absent until a truthful public contract exists` comment from `listing-group-page.tsx`. Run:

```bash
pnpm --filter=@booking/storefront lint
pnpm --filter=@booking/storefront typecheck
pnpm --filter=@booking/storefront build
```

Manually visit home top/recommended rails, catalog, dated/undated search, favorites, recent, provider, standalone detail, group detail, room browse, and related listings.

- [ ] **Step 6: Commit the synchronized customer discovery UI.**

```bash
git add apps/storefront/app/components/sale-campaign-banner.tsx apps/storefront/app/components/sale-campaign-badge.tsx apps/storefront/app/features/catalog apps/storefront/app/features/listing apps/storefront/app/features/listing-group
git commit -m "feat: synchronize sale campaign storefront UI"
```

### Task 6: Synchronize the partner pricing calendar and customer preview

**Files:**
- Create: `apps/dashboard/app/features/partner/components/listing-calendar/campaign-preview.tsx`
- Modify: `apps/dashboard/app/features/partner/lib/listing-calendar.ts`
- Modify: `apps/dashboard/app/features/partner/components/listing-calendar/day-cell.tsx`
- Modify: `apps/dashboard/app/features/partner/components/listing-calendar/week-grid.tsx`
- Modify: `apps/dashboard/app/features/partner/components/listing-calendar/day-dialog.tsx`
- Modify: `apps/dashboard/app/features/partner/components/listing-calendar/range-dialog.tsx`
- Modify: `apps/dashboard/app/features/partner/components/listing-calendar/sale-campaign-fields.tsx`
- Modify: `apps/dashboard/app/features/partner/components/recurring-pricing/rule-form.tsx`
- Modify: `apps/dashboard/app/features/partner/components/recurring-pricing/rule-row.tsx`
- Modify: `apps/dashboard/app/features/partner/components/listing-calendar/index.tsx`

**Interfaces:**
- Consumes: existing `PricingRuleResponse` sale fields and `campaignState()`.
- Produces: `campaignPresentationOf()` and `CampaignPreview`; no backend or database change.

- [ ] **Step 1: Centralize partner campaign presentation.**

Add a pure helper:

```ts
export interface CampaignPresentation {
  state: 'none' | 'scheduled' | 'running' | 'ended';
  coverage: 'full' | 'partial' | null;
  regularPrice: string | null;
  salePrice: string | null;
  label: string | null;
}

export function campaignPresentationOf(
  rules: readonly PricingRuleResponse[],
  mode: CalendarMode,
  now?: number,
): CampaignPresentation;
```

Use `partial` when the effective campaign is time-scoped or only some rules are on sale; use `full` when every effective unit represented by the cell is on sale. Never show a scheduled/ended sale price as the price a customer pays now.

- [ ] **Step 2: Apply C3 states to partner month/week views.**

Replace literal emerald classes with warning tokens. Month cells use solid/diagonal/flame semantics and include `Đang chạy`, `Sắp diễn ra`, or `Đã kết thúc`. Week cells show regular price struck through and active sale price for the exact hour; scheduled/ended cells keep the regular price and a status marker. Preserve booking dots, closed-day styling, drag selection, and past-day disabling.

- [ ] **Step 3: Make sale activation explicit in all pricing forms.**

In day, range, and recurring forms, add a `Switch` labelled `Bật giá ưu đãi`. When off, submit an empty `salePrice`, `saleStartDate`, `saleEndDate`, and `campaignLabel` so the existing action clears campaign fields. When on, require a positive sale price lower than the regular price and reveal `SaleCampaignFields`.

Rename headings/copy to `Chiến dịch giá ưu đãi`; state: `Thời hạn được xét theo lúc khách hoàn tất đặt chỗ, không phải ngày sử dụng dịch vụ.`

- [ ] **Step 4: Add the customer-facing preview.**

`CampaignPreview` receives regular price, sale price, campaign label, rule scope description, and start/end dates. Render the C3 ribbon/banner with `Giảm đến X%`, fallback label, schedule, and booking deadline. If inputs are incomplete, show a neutral `Nhập giá ưu đãi để xem trước` state rather than a fabricated percentage.

Mount the preview below `SaleCampaignFields` in day, range, and recurring forms.

- [ ] **Step 5: Update recurring rows and calendar legend.**

Recurring rule rows show both prices only for running sales and use status badges for scheduled/ended campaigns. Add a single legend to the calendar header for full-day sale, some-hours sale, scheduled, and ended; do not repeat a legend in every cell.

- [ ] **Step 6: Verify partner behavior and commit.**

Run:

```bash
pnpm --filter=@booking/dashboard lint
pnpm --filter=@booking/dashboard typecheck
pnpm --filter=@booking/dashboard build
pnpm check:frontend-structure
```

Manually inspect hourly/daily month view, hourly week view, day/range/recurring forms, sale toggle off/on, running/scheduled/ended states, mixed scopes, and the preview at desktop and 375px.

```bash
git add apps/dashboard/app/features/partner/lib/listing-calendar.ts apps/dashboard/app/features/partner/components/listing-calendar apps/dashboard/app/features/partner/components/recurring-pricing
git commit -m "feat: synchronize partner sale campaign calendar"
```

### Task 7: Separate calendar sales from checkout promotions and complete verification

**Files:**
- Modify: `apps/storefront/app/features/booking-widget/components/booking-panel-presentation.tsx`
- Modify: `apps/storefront/app/features/checkout/components/price-panel.tsx`
- Modify: `apps/storefront/app/features/checkout/components/booking-column.tsx`
- Modify: `apps/storefront/app/features/checkout/components/promo-form.tsx`
- Modify: `packages/i18n/src/locales/vi/checkout.ts`
- Modify: `packages/i18n/src/locales/en/checkout.ts`
- Modify: `docs/features/partner-calendar-pricing.md`
- Modify: `docs/data-model.md`

**Interfaces:**
- Consumes: quote line `regularAmount`, `amount`, `campaignLabel`, and checkout promotion result.
- Produces: explicit `Giá ưu đãi theo lịch` then `Ưu đãi thanh toán` presentation without changing calculation order.

- [ ] **Step 1: Rename and order the checkout discount sections.**

In quote/price panels, label calendar rule savings `Giá ưu đãi theo lịch` and list distinct campaign labels. Label promo-code/auto-campaign savings `Ưu đãi thanh toán`. Show calendar savings before checkout promotion savings, matching the existing calculation pipeline. Keep final amount and discount arithmetic unchanged.

- [ ] **Step 2: Update promotion chooser copy.**

Clarify that promotion codes apply at checkout after the calendar price. Do not merge promotion names with pricing-rule campaign labels and do not introduce stacking behavior.

- [ ] **Step 3: Update domain documentation to match the completed UI/API.**

Document `view=calendar`, the C3 full/partial semantics, exact-versus-up-to copy, Storefront resource-route flow, partner preview, and graceful fallback in `partner-calendar-pricing.md`. In `data-model.md`, keep the existing pricing order and add only the public presentation fields; state explicitly that no migration was added.

- [ ] **Step 4: Run the repository full static gate.**

Run exactly:

```bash
pnpm check:no-tests && pnpm check:module-cycles && pnpm check:frontend-structure && pnpm --filter=@booking/storefront security && pnpm turbo lint typecheck build && pnpm --filter=@booking/api check:rls
```

Expected: the complete command exits 0.

- [ ] **Step 5: Run the final manual matrix.**

With local infrastructure and seeded tenants running, verify:

- undated card → `Giảm đến X%` only;
- dated search → exact struck-through/current prices;
- full-day single-rate calendar date → solid warning style plus exact percent;
- full-day multi-rate date → solid warning style plus flame;
- partial hourly date → diagonal warning style plus flame;
- closed, blocked, and sold-out dates → no sale marker;
- selected sale slot → selection and sale cues both remain visible;
- calendar summary failure → usable calendar plus localized warning;
- quote/checkout → calendar sale appears before checkout promotion;
- partner forms → sale toggle, customer preview, and running/scheduled/ended states;
- Vietnamese and English at 375px and desktop widths;
- campaign deadline and countdown agree in `Asia/Ho_Chi_Minh` across SSR and hydration.

- [ ] **Step 6: Commit the checkout/docs finish.**

```bash
git add apps/storefront/app/features/booking-widget/components/booking-panel-presentation.tsx apps/storefront/app/features/checkout packages/i18n/src/locales/vi/checkout.ts packages/i18n/src/locales/en/checkout.ts docs/features/partner-calendar-pricing.md docs/data-model.md
git commit -m "feat: distinguish calendar sales from checkout promotions"
```

- [ ] **Step 7: Inspect final scope before handoff.**

Run:

```bash
git status --short
git log --oneline -8
```

Expected: only known pre-existing unrelated user changes remain; the seven implementation commits are visible in order and no forbidden test files exist.
