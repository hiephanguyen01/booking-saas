# Storefront Listing-Type Search & Filter — Full API Implementation Plan

**Status (2026-07-16):** Implemented in the working tree. Unit/integration test additions were intentionally omitted at the user's request; build, type-check, lint, Prisma validation, and diff checks pass.

**Goal:** Make the Storefront home, listing-type catalog, listing detail, and listing-group detail share one URL-driven search experience; move filtering, availability matching, sorting, facets, grouping, and pagination into `apps/api`; and render only filters that are valid for the selected listing type.

**Architecture:** Keep React Router as the URL/SSR boundary and make the API the source of truth for catalog results. Add a dedicated marketplace-search read module instead of composing up to 100 listings through per-listing detail, availability, and quote HTTP calls in the Storefront. The read module owns a cross-table read projection, evaluates availability in batches using the same pure scheduling/pricing rules as booking, and returns one paginated response containing normalized query state, results, facets, and supported sort options. Tenant isolation remains one `TenantDbService.forTenant()` transaction per search.

**Tech stack:** React Router 8 framework mode as actually pinned in the workspace, NestJS 11, Prisma/PostgreSQL, Redis holds, Zod contracts in `@booking/contracts`, Vitest, Testcontainers, shared shadcn UI.

## Product decisions used by this plan

- `listing type` is the category selected by the customer and remains the canonical route segment: `/:locale/t/:typeSlug`.
- The URL is the source of truth. Every filter/sort/page state is shareable, refresh-safe, and SSR-compatible.
- Selecting a listing type on the home page immediately updates the home listing rails; pressing Search navigates to that type's catalog route.
- Date controls are listing-type-driven. A type may declare no schedule filter, an hourly interval, a daily range, or an inventory range.
- A date is optional at search time. If the customer has not explicitly selected a date/range, the API does not silently filter against today/tomorrow.
- Hourly search means an exact local date plus start/end time. Daily search uses `[check-in date, checkout date)` and validates every night in the range.
- Group results count once. A group is returned when at least one published child listing matches; price and matching-room count are computed from matching children only.
- Rating filters and rating sort are explicitly out of scope.
- Supported initial sort options are:
  - `relevance`: deterministic title/query match, then publication recency as tie-breaker.
  - `bookings-desc`: completed booking count only.
  - `price-asc`: the comparable price for the selected mode/range.
- Do not expose `rating` or `promotion/discount` sort chips until those modules provide a truthful public read projection. In particular, do not recreate the mock options shown in the screenshots.
- Pagination is page-based in the public response because the existing Storefront provides numbered navigation and the result/facet response needs an exact `total`.

## Important findings in the current implementation

- The real backend app is `apps/api`, not the stale `apps/backend` path in `AGENTS.md`.
- `apps/storefront/app/lib/search.server.ts` currently performs detail + availability + quote requests per candidate, slices candidates at 100, then filters and paginates in the Storefront. This creates N+1 HTTP/DB work and makes totals incomplete.
- The current search applies fallback dates even when the customer did not choose a date.
- The current API only supports `type`, `category`, `q`, and string equality for `attr.*`; boolean, numeric ranges, availability, price, location, guests, sort, facets, and pagination are not API-owned.
- `FilterPanel` is hard-coded to Studio-like price/location/amenities/area controls and ignores the selected listing type's `attributeSchema`.
- Location is currently a normalized substring match. Listings already store official province/ward codes, so search should use codes and return labels/counts from the API.
- The current demo `photography` type supports `hourly`, not `daily`. Therefore `/t/photography?mode=daily` must not be silently treated as valid. Either use `mode=hourly`, or separately change the type and every photography listing to enable/configure `daily`.
- The group detail already has the shared search bar, but standalone listing detail does not.

## Canonical public URL contract

Example with an hourly photography search:

```text
/vi/t/photography?mode=hourly&q=&location=79&guests=1&date=2026-07-20&startTime=09%3A00&endTime=11%3A00&attr.photographyStyle=Ch%C3%A2n+dung&sort=bookings-desc&page=1
```

Example with a daily type:

```text
/vi/t/studio?mode=daily&q=&location=26740&guests=4&from=2026-07-20&to=2026-07-22&attr.style=H%C3%A0n+Qu%E1%BB%91c&minPrice=1000000&maxPrice=5000000&page=1
```

Rules:

- `mode`: only a mode enabled by the selected type's public search config.
- `location`: repeatable official code; two digits mean province, five digits mean ward. Never use display text as the filter value.
- `guests`: positive integer, applied against `Listing.capacity` first; legacy capacity-like JSON attributes are not the canonical source.
- `date`, `startTime`, `endTime`: all required together for an explicit hourly interval.
- `from`, `to`: both required for daily/inventory; `from < to`; `to` is exclusive.
- `minPrice`, `maxPrice`: VND digit strings. API compares `bigint`; do not convert money to JS floating point.
- `attr.<key>`: repeatable exact selections for boolean/select/multiselect/text-enum facets.
- `attr.<key>.min` / `attr.<key>.max`: numeric attribute bounds.
- `sort`: `relevance | bookings-desc | price-asc` initially.
- `page`: positive integer; any filter, type, mode, schedule, or sort change resets it to 1.
- Empty controls are omitted in canonical links. The parser may accept empty legacy values, but the normalized state returned by the API removes them.
- Unknown attribute keys, incompatible filter values, unsupported modes, malformed times, and invalid ranges return a stable 400 error; they are not silently ignored.

## Public API response

Evolve `GET /public/listings` from a candidate array into the complete search response. Update all current consumers in the same change.

```ts
interface PublicCatalogSearchResponse {
  type: PublicListingTypeResponse;
  applied: PublicCatalogSearchQuery;
  items: PublicCatalogSearchItem[];
  facets: PublicCatalogFacet[];
  sortOptions: Array<'relevance' | 'bookings-desc' | 'price-asc'>;
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}
```

Each item must contain its `kind`, group/listing route slug, listing type slug, photos, official location snapshot, selected-mode price, price unit, completed-booking count, matching-child count, and a bounded matching-child summary. Do not include fake rating/review/promotion fields.

Facet rules:

- System facets: price, official location, capacity/guests, and group amenities when data exists.
- Dynamic facets: generated from the selected type's filterable `attributeSchema`.
- Boolean → checkbox; select/multiselect → checkbox list; configured single-select → radio; number → configured buckets or min/max range.
- Text fields are not rendered as arbitrary checkbox facets unless the type explicitly configures a bounded option list.
- Counts are counts of unique result cards (one group = one result), not child-listing row counts.
- Return an active option even when its current count is zero, so the customer can remove it.
- Do not render counts in the Storefront unless the API returns them.

## Availability semantics

### No explicit schedule

- Filter by type, publication status, query, location, capacity, dynamic attributes, and price-from only.
- Do not call the availability engine and do not assume today/tomorrow.

### Hourly interval

- Interpret `date + startTime/endTime` in each resource's timezone.
- Require the interval to align with listing granularity and min/max duration.
- Apply weekly rules, date exceptions, lead time, buffer before/after, all active booking statuses, cross-mode bookings on the same `resource_id`, and live Redis holds.
- The full requested interval must be available; “there is any slot that day” is insufficient.
- Price is the quote for the requested duration, including matching pricing rules and exact bundle pricing.

### Daily range

- Interpret `from` as check-in day and `to` as checkout day in the resource timezone.
- Apply listing check-in/check-out times, min/max nights, weekly rules, exceptions, buffers, cross-mode bookings, and live holds.
- Every night from `from` through `to - 1 day` must be available.
- Price is the quote for the full range, not one arbitrary day's price.

### Inventory range

- Apply the requested quantity against stock minus overlapping active bookings and live holds for the full range.
- Keep the existing atomic booking-time stock check as the final correctness boundary; search availability is advisory and may change before checkout.

## Task 1: Extend listing-type and search contracts

**Files:**

- Modify `packages/contracts/src/contracts/listing-type.ts`
- Modify `packages/contracts/src/contracts/common.ts` only if a reusable paginated metadata schema is needed
- Create `packages/contracts/src/contracts/catalog-search.ts`
- Create `packages/contracts/src/contracts/catalog-search.spec.ts`
- Modify `packages/contracts/src/index.ts`

- Add `allowedModes` and `defaultModes` to `PublicListingTypeResponse`; the Storefront currently cannot truthfully decide which schedule UI applies.
- Add optional, validated `searchConfig` to the listing-type contract:
  - `schedule: none | hourly | daily | inventory`
  - `showGuests: boolean`
  - ordered system facets
  - ordered attribute facet metadata
  - numeric buckets with stable IDs, labels, and min/max bounds
- Validate that `searchConfig.schedule` is compatible with `allowedModes`, every configured attribute key exists and is filterable, and numeric buckets target numeric attributes.
- Keep backward compatibility: when `searchConfig` is absent, derive a safe default from the first supported `defaultMode`; use `none` if no Phase-1 searchable mode exists.
- Define strict query, applied-state, item, facet, sort, and response schemas.
- Add tests for repeated params, VND digit strings, invalid hourly/daily ranges, unsupported sort values, dynamic attr parsing, and default derivation.

## Task 2: Persist per-listing-type search settings and seed truthful examples

**Files:**

- Modify `apps/api/prisma/schema.prisma`
- Create `apps/api/prisma/migrations/<timestamp>_listing_type_search_config/migration.sql`
- Modify `apps/api/prisma/seed-demo-catalog.ts`
- Modify `apps/api/prisma/seed.ts` if the older demo type helper also creates listing types
- Modify `apps/api/src/modules/catalog/domain/ports/listing-type-repository.port.ts`
- Modify `apps/api/src/modules/catalog/infrastructure/repositories/prisma-listing-type.repository.ts`
- Modify catalog listing-type create/update use cases and mapper

- Add `ListingType.searchConfig Json @default("{}") @map("search_config")`; it is tenant-scoped automatically through the existing listing-type RLS policy.
- Store only validated configuration. Keep create/update backward compatible through derived defaults.
- Configure demo types truthfully:
  - `studio`: hourly/daily schedule; guests; price, location, amenities, area buckets, style, natural light.
  - `photography`: hourly schedule; guests; photography style and raw-file delivery.
  - `makeup`: hourly for the current Phase-1 demo data; style and hair styling.
  - `equipment` / `costume`: inventory range and quantity; brand/style/condition/insurance facets as applicable.
- Do not change photography to daily only to make the sample URL pass. If daily photography is a real product decision, add daily to `allowedModes/defaultModes`, add daily `modeConfig` to every affected listing, and add dedicated availability tests as a separate explicit step.

## Task 3: Add a marketplace-search read module

**Files:**

- Create `apps/api/src/modules/marketplace-search/domain/ports/catalog-search-repository.port.ts`
- Create `apps/api/src/modules/marketplace-search/domain/ports/catalog-hold-reader.port.ts`
- Create pure domain files for query normalization, group collapse, facet aggregation, relevance scoring, and schedule matching
- Create `apps/api/src/modules/marketplace-search/application/use-cases/search-public-catalog.use-case.ts`
- Create `apps/api/src/modules/marketplace-search/infrastructure/repositories/prisma-catalog-search.repository.ts`
- Create `apps/api/src/modules/marketplace-search/infrastructure/redis-catalog-hold.reader.ts`
- Create `apps/api/src/modules/marketplace-search/infrastructure/http/marketplace-search.module.ts`
- Modify `apps/api/src/app.module.ts`

- Resolve the tenant from Host, load and validate the active listing type, then perform one `forTenant()` around the complete DB search operation.
- The module is a read projection and may join listings, groups, types, resources, availability rules/exceptions, pricing rules, and booking aggregates. It must not call Catalog/Listing/Scheduling Nest services per result.
- Reuse or extract the existing pure scheduling/pricing functions. Do not duplicate business rules and do not invoke the public availability/quote endpoints internally.
- Batch-load candidate facts, rules, exceptions, booking conflicts, completed-booking counts, and pricing rules. Batch-read Redis holds. Query count/network work must not grow linearly with the number of result cards.
- Remove the current `take: 100` correctness limit.
- Apply RLS, published listing/group status, and group deduplication before returning data.
- Preserve stable tie-breakers for every sort (`publishedAt desc`, then `id`) so pagination does not shuffle.

## Task 4: Implement typed dynamic filters and truthful facets

**Files:**

- Add focused domain tests beside the marketplace-search filter/facet files
- Modify `prisma-catalog-search.repository.ts`
- Modify `search-public-catalog.use-case.ts`

- Validate all `attr.*` filters against the selected type before building Prisma/raw SQL conditions.
- Coerce by declared type:
  - boolean values to booleans
  - numeric bounds to finite decimal values
  - select values to declared options
  - multiselect values to containment checks
- Use official `provinceCode`/`wardCode` equality for location. Return stored names as labels; never substring-match addresses.
- Apply `Listing.capacity >= guests`. For groups, a child must pass capacity for the group to match.
- Apply all selected facet groups with AND; repeated options within the same checkbox facet use OR unless the facet explicitly declares `matchAll`.
- Compute facets from the availability/static matched result universe before page slicing. Ensure counts use unique group/listing cards.
- Compare price as `bigint`. For groups use the lowest price among matching children.

## Task 5: Implement sort and server-side pagination

**Files:**

- Modify marketplace-search use case/repository and tests
- Modify `apps/api/src/modules/catalog/infrastructure/http/public-catalog.controller.ts`
- Modify `apps/api/src/modules/catalog/infrastructure/http/dto/catalog.dto.ts`
- Modify `apps/api/src/modules/catalog/application/catalog.mapper.ts` or replace its public-list mapper with the new search mapper

- `relevance`: exact title > title prefix > title contains; when `q` is empty, use publication recency. Add deterministic tie-breakers.
- `bookings-desc`: aggregate only `completed` bookings across matching children. Cancelled/draft/failed bookings do not count.
- `price-asc`: selected-range quote when a schedule is present; otherwise selected-mode per-unit/base price. Null price sorts last.
- Return exact `page`, `pageSize`, `total`, and `totalPages`; clamp an out-of-range page to the final valid page or redirect to the normalized page in the Storefront.
- Default `pageSize=12`, cap at 48 for public search.
- Change `GET /public/listings` to return the rich response and document it in Swagger.
- Update home, sitemap, and any other array consumers in the same milestone; sitemap must iterate pages rather than assuming one unbounded array.

## Task 6: Replace Storefront search composition with one API call

**Files:**

- Modify `apps/storefront/app/lib/catalog.server.ts`
- Delete or reduce `apps/storefront/app/lib/search.server.ts` to location-independent browser-safe helpers only
- Modify `apps/storefront/app/features/search/search-state.ts`
- Modify `apps/storefront/app/features/search/search-state.spec.ts`
- Modify `apps/storefront/app/routes/catalog.tsx`

- Parse the route query with the shared contract, forward it server-to-server, and validate the API response.
- Pass `request.signal` through the API client so superseded filter navigations abort.
- Remove all per-listing `fetchListing`, `fetchListingGroup`, `fetchAvailability`, and `fetchQuote` work from the catalog loader.
- Use the API-returned normalized `applied` state. Keep filters in the URL; do not duplicate them in React global state.
- Preserve `noindex,follow` for generated filtered pages and canonicalize the unfiltered type page.
- Add regression tests proving no date filter is sent unless explicitly selected and incompatible params disappear when the type/mode changes.

## Task 7: Make home category selection immediate and schedule-aware

**Files:**

- Modify `apps/storefront/app/routes/home.tsx`
- Modify `apps/storefront/app/templates/studio/home-data.server.ts`
- Modify `apps/storefront/app/templates/studio/home.tsx`
- Modify `apps/storefront/app/templates/studio/hero.tsx`
- Modify `apps/storefront/app/features/search/search-form.tsx`
- Add/update focused home/search component tests

- Read `?type=<slug>` in the home loader and validate it against active listing types from the locale layout context/API.
- Category tab selection performs a GET navigation to the same localized home with `type`, immediately reloading the home preview for that type. Use pending UI; preserve browser back/forward behavior.
- The Search button still submits to `/:locale/t/:selectedType` with the current valid search fields.
- Render schedule controls from the selected type's `searchConfig`:
  - `none`: no date/time control.
  - `hourly`: date + start/end time.
  - `daily`: range calendar.
  - `inventory`: rental range + quantity.
- Render guests only when configured. Clear incompatible schedule/guest params on type changes.
- Keep an accessible mobile control; do not rely on horizontally truncated tabs when more than six types exist.

## Task 8: Render dynamic catalog filters, sort, and pagination

**Files:**

- Modify `apps/storefront/app/features/catalog/catalog-page.tsx`
- Rewrite `apps/storefront/app/features/catalog/components/filter-panel.tsx`
- Modify `apps/storefront/app/features/catalog/components/filter-panel.spec.tsx`
- Modify `apps/storefront/app/features/catalog/components/catalog-pagination.tsx`
- Modify `apps/storefront/app/features/catalog/components/search-result-card.tsx`
- Update `@booking/i18n` catalog/listing namespaces in both Vietnamese and English

- Render `FilterPanel` from API facet descriptors; remove Studio-specific hard-coded amenity/area behavior.
- Keep desktop sidebar and mobile drawer behavior aligned. Both submit the same GET params.
- Show option counts only from API data.
- Preserve active filters that temporarily have zero count and provide individual removable filter chips above results.
- Applying/clearing any filter resets page 1 and preserves type, mode, schedule, query, and sort as appropriate.
- Render only API-returned sort options. Do not retain the currently parsed-but-unimplemented `rating` and `bookings` values.
- Use the API pagination metadata. Preserve all normalized params in previous/next/page links.
- Provide loading skeleton, empty state with “clear filters”, invalid-query error state, and no-availability state.

## Task 9: Add the search/filter bar to detail pages

**Files:**

- Modify `apps/storefront/app/routes/listing.tsx`
- Modify `apps/storefront/app/features/listing/listing-page.tsx`
- Modify `apps/storefront/app/routes/listing-group.tsx`
- Modify `apps/storefront/app/features/listing-group/listing-group-page.tsx`
- Modify shared search-state/link helpers and tests

- Load enough public listing-type metadata and location suggestions/facets to render the same adaptive search bar on standalone listing detail.
- Keep the existing search bar on group detail but switch it to the normalized contract and type configuration.
- Initialize the bar with the current detail's `listingTypeSlug` and any valid search context carried from the catalog result link.
- Submitting from either detail page always navigates to `/:locale/t/:selectedType?...`.
- When the customer selects a different type, the destination route uses that new type and incompatible filters are removed.
- Keep the booking panel/room picker on the detail page for booking the current item. The global filter bar is for finding alternatives and must not mutate the current listing booking selection.

## Task 10: Remove obsolete client-side search behavior

**Files:**

- Delete obsolete enrichment/filter helpers and tests after replacements pass
- Update `apps/storefront/app/templates/studio/home-listing-fixtures.ts` so fixtures are development-only and conform to the rich response, or remove search-dependent fixture fallback
- Update architecture comments that still describe client-side filtering

- Remove `composeSearchResults`, `mapLimit`, fallback-date availability filtering, substring location matching, local price sorting, and local result slicing.
- Remove `SearchSort` members that have no API implementation.
- Remove decorative/fake review wording from result cards unless it is clearly an unavailable-state label; no synthetic stars/counts.

## Task 11: Test availability, tenant isolation, and performance

**Files:**

- Create `apps/api/test/public-catalog-search.integration.spec.ts`
- Add focused marketplace-search unit tests
- Add Storefront route/component tests near changed files
- Add/update Playwright Storefront catalog smoke coverage if a Playwright package already exists; do not introduce a second browser framework

API integration cases:

- Host resolves the correct tenant and RLS prevents cross-tenant results/facets/counts.
- Group with two matching children returns one card with `matchingChildCount=2`; a nonmatching child does not affect price/facets.
- Hourly interval respects timezone, opening rules, exceptions, lead time, granularity, min/max duration, buffers, cross-mode booking conflicts, and Redis holds.
- Daily range respects exclusive checkout, min/max nights, closed/blocked days, cross-mode conflicts, and full-range quote.
- Inventory respects requested quantity over the full range.
- No explicit date does not filter against today.
- Dynamic boolean/select/multiselect/number filters are type-checked and unknown keys return 400.
- Location uses official codes and counts unique cards.
- Completed-booking sort, price sort, relevance tie-breakers, exact totals, and page boundaries are deterministic.
- Search work remains bounded: assert a fixed upper bound on SQL/Redis calls for 200 candidates and fail any per-result query regression.

Storefront cases:

- Home type tab updates `?type=` and the displayed rail immediately.
- Hourly/daily/inventory/no-schedule types render the correct controls.
- Switching type removes incompatible date/time/attribute params.
- Catalog loader performs one search API request.
- Applying a facet/sort resets page 1; pagination preserves all other params.
- Listing and group detail search submits to the correct localized `/t/:typeSlug` route.
- Filtered pages are `noindex,follow`; unfiltered type pages remain canonical/indexable.

## Task 12: Verification sequence

Run in this order:

```bash
pnpm --filter @booking/contracts test
pnpm --filter @booking/contracts typecheck
pnpm --filter @booking/api prisma:generate
pnpm --filter @booking/api typecheck
pnpm --filter @booking/api lint
pnpm --filter @booking/api test
pnpm --filter @booking/api test:integration
pnpm --filter @booking/storefront test
pnpm --filter @booking/storefront typecheck
pnpm --filter @booking/storefront lint
pnpm --filter @booking/storefront build
pnpm build
git diff --check
```

Also manually verify at least one type of each schedule configuration on desktop and mobile, including direct URL reload, browser Back, empty results, Redis hold appearance/expiry, and a page beyond page 1.

## Acceptance criteria

- Selecting a type on home immediately shows only that type's real listings and updates shareable URL state.
- Search controls and sidebar facets are generated from the selected listing type; no Studio-only hard-coded filter leaks into unrelated types.
- Types configured without schedule search show no calendar. Hourly, daily, and inventory types show the correct picker.
- An explicit hourly/daily/inventory search returns only listings available for the entire requested interval/range and quantity.
- API, not Storefront, owns filtering, grouping, price comparison, facets, sorting, totals, and pagination.
- Catalog loading has no per-listing HTTP calls and no hidden 100-result cap.
- Locations use official codes; money is compared as bigint VND; all time calculations use resource timezone.
- Group results are deduplicated and link to `/g/:groupSlug`; standalone results link to `/l/:listingSlug`.
- Detail and group-detail filters navigate to the correct localized `/t/:typeSlug` route.
- Sort UI contains only implemented options. Rating and promotion sorting are absent.
- All contract, API, integration, Storefront, type-check, lint, and build commands pass.

## Explicit non-goals

- Reviews, rating filters, rating sorting, or synthetic star counts.
- “Ưu đãi nhiều nhất” sorting until promotions expose a public, date-aware effective-discount projection.
- Appointment/staff and class/session availability search; those remain Phase 3. Their listing types use `searchConfig.schedule = none` until their engines exist.
- Map/geospatial radius search, travel-time search, or address geocoding.
- A Dashboard editor for advanced search configuration in this milestone. The API/contracts persist it and seeds demonstrate it; a tenant-admin UI can follow separately.
- A new external search engine. Start with the PostgreSQL read projection and add an index/search service only after measured scale requires it.

## Recommended follow-ups

- Add active-filter chips with one-click removal; this materially improves mobile usability.
- Persist recent searches in the Storefront session, not local storage, so URL state remains authoritative.
- Add “available now / today” shortcuts only after they map to an explicit valid interval; never make them label-only filters.
- Later add promotion sorting from an effective public offer projection and rating sorting from denormalized review aggregates—both should become API-advertised sort capabilities, not hard-coded UI chips.
