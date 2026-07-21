# Dashboard Search & Filter — Design Spec

**Date:** 2026-07-21
**Status:** Draft (awaiting review)
**Scope:** Add reasonable, consistent search + filter to **all** list pages in `apps/dashboard`.

---

## 1. Goal

Every server-paginated list page in the dashboard should offer a consistent, URL-driven
search + filter experience. Today the story is uneven:

- ~10 pages have real search/filter, but each **copy-pastes** its own `<Form>` + input +
  `<NativeSelect>` markup.
- Several pages have **only status tabs** or **only pagination**.
- One page (`partner/bookings`) filters **client-side** with `useState` instead of the URL.
- Several **backend** list endpoints have no search contract at all.

This spec introduces a small set of reusable, URL-aware toolbar components plus a per-page
**filter spec**, then rolls it out to every list page — migrating the pages that already have
filters and filling the gaps, including the backend work needed for pages whose API can't
search yet.

### Decisions (locked with owner)

| Decision | Choice |
| --- | --- |
| Backend scope | **Full** — add search/filter contracts + Prisma to every list endpoint that lacks them |
| Shared toolbar | **Extract + migrate all** — build reusable components, migrate existing filtered pages onto them too |
| Filter recipe | **Search + status + date** where the data supports it, chosen per page |
| Sorting | **Deferred** — no sortable columns in this work; lists keep default ordering |
| Search UX | **Debounced auto-submit** (~300ms) via React Router `useSubmit`; no submit button |

### Hard rules honored

- **No tests** (ADR 0005) — verification is `typecheck` + `lint` + `build` + running the app.
- **`controller → use-case → repository-port → repository`**, one use-case per file (ADR 0006).
  Backend search is added by extending existing list use-cases' params + their Prisma repos; no
  new service classes, no new use-case files beyond what already exists per list.
- **All tenant data through `TenantDbService.forTenant`** — search/date/status `where` clauses are
  added *inside* the existing `forTenant` transaction, so RLS + tenant isolation are untouched.
- **URL-driven, server-side** — filters live in the URL search params; loaders read them and pass
  them server→server via `@booking/api-client`. No browser fetching.
- **Money = bigint VND, time = timestamptz UTC** — date filters convert to ISO day-bounds
  (`from` = start-of-day, `to` = end-of-day) before hitting the API.

---

## 2. Architecture

### 2.1 The filter spec (single source of truth)

Each list page declares a **filter spec**: an array describing each filter — its URL key, its
kind (`text | enum | date`), and (for `enum`) its options. The spec is the *only* place a page's
filters are defined. It is imported by:

- the **loader**, to parse + validate the params (`readListFilters`), and
- the route **component**, to render the toolbar controls (`<ListToolbar spec=…>`).

Because both sides consume the same spec, the parse logic and the rendered controls can never
drift out of sync.

```ts
// shape (illustrative)
type FilterSpec =
  | { key: string; kind: 'text';  placeholder: string }
  | { key: string; kind: 'enum';  label: string; options: { value: string; label: string }[] }
  | { key: string; kind: 'date';  fromKey: string; toKey: string; label: string };
```

Status that is better shown as a **tab row with count chips** (listings, partners, bookings)
keeps using the existing `<StatusFilterTabs>` and is *not* modeled as an `enum` in the spec —
the spec covers the toolbar controls (text search, dropdown filters, date range); tabs remain a
separate, complementary control on those pages.

### 2.2 Data flow (unchanged chain)

```
URL searchParams
  → loader: readListFilters(searchParams, spec) → { filters, apiFilters }
           + readListParams(searchParams).toApiQuery(apiFilters)
  → apiGet(path, auth, { query })            (axios params, server→server)
  → NestJS @Query() Zod DTO (paginationQuerySchema.extend)
  → use-case params
  → Prisma repo where {...}                  (inside forTenant tx)
  → PaginatedWithCounts<T>
component: readListParams(searchParams) → pageHref / filterHref
           <ListToolbar spec filters={filters} />
           <PaginationBar hrefFor={pageHref} />
```

The existing pagination layer (`readListParams`, `toApiQuery`, `pageHref`, `filterHref`,
`<PaginationBar>`, `<StatusFilterTabs>`, `PaginatedWithCounts`) is reused as-is. This spec adds
only the toolbar UI + a generic filter reader on top.

### 2.3 New components (in `app/components`, dashboard)

These live in the dashboard app — not `packages/ui` — because they depend on React Router hooks
(`useSearchParams`, `useSubmit`), exactly like the existing `StatusFilterTabs` / `PaginationBar`.
`packages/ui` stays framework-agnostic and only provides the visual primitives they compose
(`Input`, `NativeSelect`, `Calendar`, `Popover`).

| Component | Responsibility |
| --- | --- |
| `<ListToolbar>` | Layout container. Renders a `<SearchBox>` (if the spec has a `text` filter), the `enum`/`date` controls, and a **"Xoá lọc"** clear-all link that appears only when ≥1 filter is active. Every change **resets `page` → 1** and **preserves `pageSize`**. Optional right-side `actions` slot (e.g. "Tạo mới"). |
| `<SearchBox>` | Debounced (~300ms) text input wired via `useSubmit`. Patches its URL key (`q` or `search`) on change; inline clear (×) button; no submit button. Reads initial value from the URL. |
| `<FilterSelect>` | A `NativeSelect` bound to one URL key. On change patches the key + resets page. Options from the spec. |
| `<DateRangeFilter>` | `from` / `to` inputs (native `date`) bound to two URL keys; converts to ISO day-bounds for the API. |

Behavior details:

- **Debounce + navigation:** `<SearchBox>` uses `useSubmit(form, { replace: true })` so rapid
  typing doesn't spam browser history; filter dropdowns/date use a normal push nav (via
  `filterHref`) so they're individually back-navigable.
- **Empty values dropped:** empty search / "all" enum / empty date are removed from the URL (not
  written as blank keys), matching `toApiQuery`'s existing "drop empty" behavior.
- **Controlled defaults:** loader returns a `filters` object so inputs render with
  `defaultValue`/`value` from the URL and survive reloads.

### 2.4 New lib: `app/lib/list-filters.ts`

```ts
readListFilters(searchParams: URLSearchParams, spec: FilterSpec[]): {
  filters: Record<string, string>;        // raw values for controlled inputs
  apiFilters: Record<string, string | undefined>; // cleaned; dates → ISO bounds; ready for toApiQuery
}
```

Generalizes today's `app/features/payments/lib/payment-history.ts#readPaymentHistoryFilters`
(the current best per-feature reader): the `filters`/`apiFilters` split, ISO date-bound
conversion (`boundIso`), and dropping empty values become spec-driven and shared. `readListParams`
and `pagination.ts` are unchanged; `readListFilters` output feeds straight into
`toApiQuery(apiFilters)`.

---

## 3. Backend additions

For endpoints that can't search today, add filter fields to the **contract** list-query schema,
thread them through the existing **use-case** params, and extend the **Prisma repo** `where`.
Model on the confirmed working example `list-tenants.use-case.ts` → `prisma-tenant.repository.ts`:

```ts
...(params.search ? { OR: [
  { name: { contains: params.search, mode: 'insensitive' } },
  { code: { contains: params.search, mode: 'insensitive' } },
]} : {})
...(params.status ? { status: params.status } : {})
...(params.from || params.to ? { createdAt: { gte: from, lte: to } } : {})
```

All added `where` clauses run **inside the existing `forTenant` transaction** — no change to RLS,
tenant scoping, or the controller/use-case/repo shape. Contracts extend the existing
`paginationQuerySchema.extend({...})`.

### Endpoints needing new contract + Prisma work

| Endpoint | Add | Search columns |
| --- | --- | --- |
| `/tenant/promotions`, `/partner/promotions` | `search`, `status` (active/expired/scheduled), `from`/`to` | name, code |
| `/tenant/listing-groups` | `search` | name |
| `/tenant/listing-types` | `search` | name |
| `/affiliate/commissions` | `search`, `status`, `from`/`to` | code, booking ref |
| `/affiliate/links` | `search` | code, label |
| `/tenant/bookings`, `/partner/bookings` | `search`, `from`/`to` (status already exists) | customer name/email, booking ref |

### Endpoints where backend already supports it (wire the UI only)

| Endpoint | Already supports |
| --- | --- |
| `/tenant/partners` | `q` (name/slug) + `status` — UI currently sends only status |
| `/tenant/listings`, `/partner/listings` | `q` (title) + `status` + `groupId` — UI currently sends only status |

> Optional cleanup: a shared `searchableListQuerySchema` mixin in `packages/contracts` to reduce
> `.extend` duplication. Nice-to-have, not required.

---

## 4. Per-page rollout & filter recipe

Recipe = **search + status + date where the data supports it**, decided per page. "Migrate only"
= swap bespoke `<Form>` markup for `<ListToolbar spec>` with no behavior change. "+API" = needs
the backend work in §3.

| Page | Search on | Status / type filter | Date | Work |
| --- | --- | --- | --- | --- |
| `admin/tenants` | name/slug ✔ | status, vertical | — | migrate |
| `admin/transactions`, `tenant/finance/transactions` | ✔ | status, kind | ✔ | migrate |
| `admin/reviews`, `tenant/reviews`, `partner/reviews` | ✔ | responseStatus, rating | ✔ | migrate |
| `tenant/favorites`, `partner/favorites` | ✔ | target (+ partnerId) | — | migrate |
| `admin/disputes`, `tenant/finance/disputes`, `partner/disputes` | ✔ | status, responseStatus | ✔ | migrate |
| `admin/settlements`, `tenant/finance/settlements` | — | status (+ partnerId) | — | migrate |
| `tenant/finance/ledger` | — | entryType | ✔ | migrate |
| `tenant/partners` | name/slug | status (tabs) | — | wire existing `q` |
| `tenant/listings`, `partner/listings` | title | status (tabs), group | — | wire existing `q` |
| `tenant/bookings` | customer/ref | status (tabs) | ✔ | +API |
| `partner/bookings` | customer/ref | status | ✔ | +API; **migrate client `useState` → URL-driven** |
| `tenant/promotions`, `partner/promotions` | name/code | active/expired/scheduled | ✔ | +API |
| `tenant/listing-groups` | name | — | — | +API |
| `tenant/listing-types` | name | — | — | +API |
| `affiliate/commissions` | code/booking ref | status | ✔ | +API |
| `affiliate/links` | code/label | — | — | +API |
| `admin/plans` | name | — | — | +API (low priority; small fixed list — may skip) |

Notes:

- **Tabs vs dropdown:** pages that already use `<StatusFilterTabs>` (listings, partners,
  affiliates, bookings) keep the tab row for status and gain a `<SearchBox>` (+ date) in the
  toolbar above it. We do not convert working tab UIs to dropdowns.
- **`partner/bookings`** is the one behavioral change beyond adding controls: its client-side
  `useState` status filter over a fixed fetched window becomes URL-driven with a real date range,
  matching every other list.
- **`admin/plans`** is a small, effectively-static list; adding search is low value. Flagged as
  optional — decide during implementation.

---

## 5. Phasing (one spec, three implementation phases)

1. **Infra.** Build `<ListToolbar>`, `<SearchBox>`, `<FilterSelect>`, `<DateRangeFilter>` +
   `readListFilters`. Prove end-to-end on **`tenant/partners`** (backend `q` already exists) and
   **`tenant/listings`**.
2. **Migrate existing filtered pages** onto the toolbar (behavior-preserving): tenants,
   transactions ×2, reviews ×3, favorites ×2, disputes ×3, settlements ×2, ledger. Delete the
   now-dead bespoke `<Form>` markup and `readPaymentHistoryFilters` (folded into `readListFilters`).
3. **Backend + gap-fill.** Add contracts/Prisma search (§3) for promotions ×2, listing-groups,
   listing-types, affiliate commissions, affiliate links, bookings ×2; then wire those pages'
   toolbars. Migrate `partner/bookings` to URL-driven.

Each phase ends with `pnpm turbo lint typecheck build` green + a manual pass in the running app
(seeded StudioHub tenant). Node ≥ 22.22.0 (`nvm use`) for the frontends.

---

## 6. Out of scope

- **Sorting / sortable columns** — deferred to a follow-up.
- **Saved filters / filter presets.**
- **Full-text / fuzzy search infra** — search is `ILIKE contains`, matching the existing
  `list-tenants` pattern.
- **Storefront** filters (public site) — dashboard only.
- **Non-list routes** — detail/new/edit pages, calendar, settings, profile, uploads.

---

## 7. Open questions

- `admin/plans`: add minimal name search or skip? (Lean: skip — tiny fixed list.)
- Promotions `status` semantics: derive active/expired/scheduled from date columns vs a stored
  status enum — confirm against the promotions schema during Phase 3.
- Whether to introduce the optional `searchableListQuerySchema` contract mixin now or leave the
  per-schema `.extend` duplication.
