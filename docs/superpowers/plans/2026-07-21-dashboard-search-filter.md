# Dashboard Search & Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every server-paginated list page in `apps/dashboard` a consistent, URL-driven search + filter toolbar, backed by search support on every list API that lacks it.

**Architecture:** A per-page **filter spec** (array of typed field descriptors) is the single source of truth: the loader parses it with a new generic `readListFilters`, and the route component renders it with a new URL-aware `<ListToolbar>`. Both feed the *existing* pagination layer (`readListParams`/`toApiQuery`/`<PaginationBar>`/`<StatusFilterTabs>`) unchanged. Backend search is added by extending existing list contracts + use-case params + Prisma `where` clauses inside the existing `forTenant` transaction.

**Tech Stack:** React Router 8 (framework mode, loaders/actions, `useSubmit`), Zod contracts (`@booking/contracts`), NestJS 11 hexagonal, Prisma, Tailwind v4 + shadcn (`@booking/ui`).

## Global Constraints

- **NO TESTS, ever** (ADR 0005). Verification = `typecheck` + `lint` + `build` + running the app. Never create `*.spec.*`/`*.test.*` or test config.
- **Node ≥ 22.22.0** — run `nvm use` before any frontend `dev`/`build`/`typecheck`/`lint` (React Router 8 bails on Node < 22.22.0). pnpm 10.13.1; **pnpm only**.
- **Backend flow is `controller → use-case → repository-port → repository`. No service classes.** One use-case = one file with a single `execute()`. Backend search extends existing list use-cases + repos only — **no new use-case files**.
- **All tenant data flows through `TenantDbService.forTenant`.** New `where` clauses go *inside* the existing transaction; never touch RLS, tenant scoping, or add a raw client call.
- **URL-driven, server-side only.** Filters live in URL search params; loaders read them and fetch server→server via `@booking/api-client`. **Never fetch the backend from the browser**; do not add `axios`/`react-query`/`@booking/query`.
- **Money = bigint VND; time = timestamptz UTC.** Date filters convert to ISO day-bounds (`from` = start-of-day, `to` = end-of-day) before the API call.
- **Dashboard UI copy is Vietnamese, hardcoded.**
- **Dashboard folder rules** (`apps/dashboard/CLAUDE.md`): shared multi-area components in `app/components/`; feature code in `features/<name>/{components,server,lib}`; route URLs from `~/constants/paths`; `~/` alias; components/features never import from `routes/**`.
- **`packages/ui` is framework-agnostic** (no `react-router` runtime import) — URL-aware toolbar components live in `app/components/`, composing `@booking/ui` visual primitives (`Input`, `NativeSelect`).
- **Contracts build to `dist/`** — after editing any `packages/contracts` file run `pnpm --filter=@booking/contracts build` before typechecking consumers.
- **Commit frequently**, one task per commit. Commit message trailer:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

## File Structure

**New files:**
- `apps/dashboard/app/lib/list-filters.ts` — `FilterSpec` types, `readListFilters`, `hasActiveFilters`, `boundIso`.
- `apps/dashboard/app/components/list-toolbar.tsx` — `<ListToolbar>` + internal `<SearchBox>`, `<FilterSelect>`, `<DateRangeFilter>`.

**Modified (frontend):** the ~30 list routes/feature components in the per-page tables below.
**Modified (backend):** list contracts in `packages/contracts/src/contracts/*`, their list use-cases + Prisma repos in `apps/api/src/modules/*`.

**Deleted:** `apps/dashboard/app/features/payments/lib/payment-history.ts` (folded into `readListFilters`) once its consumers are migrated (Task 8).

---

## PHASE 1 — Shared infrastructure

### Task 1: `readListFilters` + filter-spec types

**Files:**
- Create: `apps/dashboard/app/lib/list-filters.ts`

**Interfaces:**
- Consumes: `FilterPatch` from `~/lib/pagination`; `TZ_OFFSET` from `~/constants/time`.
- Produces:
  - `type FilterField` (union: `text` | `enum` | `date-range`) and `type FilterSpec = readonly FilterField[]`.
  - `readListFilters(searchParams: URLSearchParams, spec: FilterSpec): { filters: Record<string,string>; apiFilters: Record<string, string | undefined> }`.
  - `hasActiveFilters(filters: Record<string,string>): boolean`.

- [ ] **Step 1: Write the module**

Create `apps/dashboard/app/lib/list-filters.ts`:

```ts
// Generic URL <-> list-filter reader. Client-safe, framework-free. Pairs with
// readListParams (pagination.ts): readListFilters parses the *filter* params,
// readListParams parses page/pageSize. Feed apiFilters straight into toApiQuery.
import { TZ_OFFSET } from '~/constants/time';

export type FilterField =
  | { kind: 'text'; key: string; label: string; placeholder: string }
  | {
      kind: 'enum';
      key: string;
      label: string;
      options: readonly { value: string; label: string }[];
      /** Label for the "no filter" option (default "Tất cả"). */
      allLabel?: string;
    }
  | { kind: 'date-range'; fromKey: string; toKey: string; label: string };

export type FilterSpec = readonly FilterField[];

/** Convert a `YYYY-MM-DD` day to an ISO instant at the start/end of that day (project TZ). */
export function boundIso(day: string, edge: 'start' | 'end'): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return undefined;
  const time = edge === 'start' ? '00:00:00.000' : '23:59:59.999';
  const value = new Date(`${day}T${time}${TZ_OFFSET}`);
  return Number.isNaN(value.getTime()) ? undefined : value.toISOString();
}

export interface ReadListFiltersResult {
  /** Raw values keyed by URL key — bind to controlled inputs' `defaultValue`. */
  filters: Record<string, string>;
  /** Cleaned values (empty dropped, dates -> ISO bounds) — pass to `toApiQuery`. */
  apiFilters: Record<string, string | undefined>;
}

/**
 * Parse a page's filter spec off the loader URL. Text is trimmed; enum values are
 * kept only if they match a declared option (else dropped); date-range endpoints
 * become ISO day-bounds. Both loader and component import the same `spec`, so the
 * parsed keys and the rendered controls can never drift.
 */
export function readListFilters(
  searchParams: URLSearchParams,
  spec: FilterSpec,
): ReadListFiltersResult {
  const filters: Record<string, string> = {};
  const apiFilters: Record<string, string | undefined> = {};

  for (const field of spec) {
    if (field.kind === 'text') {
      const raw = searchParams.get(field.key)?.trim() ?? '';
      filters[field.key] = raw;
      apiFilters[field.key] = raw || undefined;
    } else if (field.kind === 'enum') {
      const raw = searchParams.get(field.key) ?? '';
      const valid = field.options.some((o) => o.value === raw);
      filters[field.key] = valid ? raw : '';
      apiFilters[field.key] = valid ? raw : undefined;
    } else {
      const from = searchParams.get(field.fromKey) ?? '';
      const to = searchParams.get(field.toKey) ?? '';
      filters[field.fromKey] = from;
      filters[field.toKey] = to;
      apiFilters[field.fromKey] = boundIso(from, 'start');
      apiFilters[field.toKey] = boundIso(to, 'end');
    }
  }
  return { filters, apiFilters };
}

/** True if any filter value is non-empty (drives the "Xoá lọc" affordance + empty-state copy). */
export function hasActiveFilters(filters: Record<string, string>): boolean {
  return Object.values(filters).some((v) => v !== '');
}
```

- [ ] **Step 2: Verify TZ_OFFSET import path**

Run: `test -f "apps/dashboard/app/constants/time.ts" && grep -n "TZ_OFFSET" apps/dashboard/app/constants/time.ts`
Expected: prints a line exporting `TZ_OFFSET` (used identically in the existing `payment-history.ts`). If the file is elsewhere, fix the import to match.

- [ ] **Step 3: Typecheck**

Run: `nvm use && pnpm --filter=@booking/dashboard typecheck`
Expected: PASS (no references to the new module yet; it must compile standalone).

- [ ] **Step 4: Commit**

```bash
git add apps/dashboard/app/lib/list-filters.ts
git commit -m "feat(dashboard): add generic readListFilters + filter-spec types"
```

---

### Task 2: `<ListToolbar>` toolbar components

**Files:**
- Create: `apps/dashboard/app/components/list-toolbar.tsx`

**Interfaces:**
- Consumes: `FilterSpec` from `~/lib/list-filters`; `Input`/`NativeSelect`/`Label`/`Button` from `@booking/ui`; `useSubmit`, `Link` from `react-router`.
- Produces: `<ListToolbar spec filters resetHref pageSize actions? />` where
  `spec: FilterSpec`, `filters: Record<string,string>`, `resetHref: string`, `pageSize: number`, `actions?: ReactNode`.

- [ ] **Step 1: Write the component**

Create `apps/dashboard/app/components/list-toolbar.tsx`:

```tsx
import { Search } from 'lucide-react';
import { useRef, type ReactNode } from 'react';
import { Form, Link, useSubmit } from 'react-router';
import { Button } from '@booking/ui/components/ui/button';
import { Input } from '@booking/ui/components/ui/input';
import { Label } from '@booking/ui/components/ui/label';
import { NativeSelect } from '@booking/ui/components/ui/native-select';
import type { FilterField, FilterSpec } from '~/lib/list-filters';
import { hasActiveFilters } from '~/lib/list-filters';

const SEARCH_DEBOUNCE_MS = 300;

/**
 * URL-driven list toolbar. Renders one GET `<Form>`; each control auto-submits so
 * the loader re-runs (text debounced ~300ms via useSubmit, selects/dates immediate).
 * Because `page` is NOT a form field, any submit drops it -> resets to page 1; the
 * hidden `pageSize` input preserves page size. "Xoá lọc" links back to `resetHref`
 * (the area list index) to clear everything. Single-table pages only — a Form submit
 * drops unrelated params (namespaced sub-table pages should keep their bespoke wiring).
 */
export function ListToolbar({
  spec,
  filters,
  resetHref,
  pageSize,
  actions,
}: {
  spec: FilterSpec;
  filters: Record<string, string>;
  resetHref: string;
  pageSize: number;
  actions?: ReactNode;
}) {
  const submit = useSubmit();
  const debounce = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const submitForm = (form: HTMLFormElement) => submit(form, { replace: true });
  const onSearchInput = (event: React.FormEvent<HTMLInputElement>) => {
    const form = event.currentTarget.form;
    if (!form) return;
    clearTimeout(debounce.current);
    debounce.current = setTimeout(() => submitForm(form), SEARCH_DEBOUNCE_MS);
  };
  const onControlChange = (event: React.ChangeEvent<HTMLElement & { form: HTMLFormElement | null }>) => {
    if (event.currentTarget.form) submitForm(event.currentTarget.form);
  };

  return (
    <Form method="get" className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="pageSize" value={pageSize} />
      {spec.map((field) => (
        <ToolbarField
          key={fieldKey(field)}
          field={field}
          filters={filters}
          onSearchInput={onSearchInput}
          onControlChange={onControlChange}
        />
      ))}
      <noscript>
        <Button type="submit" variant="secondary">
          <Search className="size-4" /> Lọc
        </Button>
      </noscript>
      {hasActiveFilters(filters) ? (
        <Button asChild variant="ghost">
          <Link to={resetHref}>Xoá lọc</Link>
        </Button>
      ) : null}
      {actions ? <div className="ml-auto">{actions}</div> : null}
    </Form>
  );
}

function fieldKey(field: FilterField): string {
  return field.kind === 'date-range' ? field.fromKey : field.key;
}

function ToolbarField({
  field,
  filters,
  onSearchInput,
  onControlChange,
}: {
  field: FilterField;
  filters: Record<string, string>;
  onSearchInput: (e: React.FormEvent<HTMLInputElement>) => void;
  onControlChange: (e: React.ChangeEvent<HTMLElement & { form: HTMLFormElement | null }>) => void;
}) {
  if (field.kind === 'text') {
    return (
      <div className="min-w-56 flex-1 space-y-1.5">
        <Label htmlFor={field.key}>{field.label}</Label>
        <Input
          id={field.key}
          name={field.key}
          type="search"
          defaultValue={filters[field.key] ?? ''}
          placeholder={field.placeholder}
          onInput={onSearchInput}
        />
      </div>
    );
  }
  if (field.kind === 'enum') {
    return (
      <div className="space-y-1.5">
        <Label htmlFor={field.key}>{field.label}</Label>
        <NativeSelect
          id={field.key}
          name={field.key}
          defaultValue={filters[field.key] ?? ''}
          onChange={onControlChange}
        >
          <option value="">{field.allLabel ?? 'Tất cả'}</option>
          {field.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </NativeSelect>
      </div>
    );
  }
  return (
    <>
      <div className="space-y-1.5">
        <Label htmlFor={field.fromKey}>{field.label} từ</Label>
        <Input
          id={field.fromKey}
          name={field.fromKey}
          type="date"
          defaultValue={filters[field.fromKey] ?? ''}
          className="w-auto"
          onChange={onControlChange}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={field.toKey}>{field.label} đến</Label>
        <Input
          id={field.toKey}
          name={field.toKey}
          type="date"
          defaultValue={filters[field.toKey] ?? ''}
          className="w-auto"
          onChange={onControlChange}
        />
      </div>
    </>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `nvm use && pnpm --filter=@booking/dashboard typecheck`
Expected: PASS.

- [ ] **Step 3: Lint**

Run: `pnpm --filter=@booking/dashboard lint`
Expected: PASS (no unused vars; `React` types resolve via the existing tsconfig JSX runtime).

- [ ] **Step 4: Commit**

```bash
git add apps/dashboard/app/components/list-toolbar.tsx
git commit -m "feat(dashboard): add URL-driven ListToolbar (search/select/date, debounced)"
```

---

### Task 3: Prove the pattern — wire `tenant/partners` + add search to `tenant/listings`

Backend already supports `q` on both endpoints (`listPartnersQuerySchema`, `listTenantListingsQuerySchema`) — no API work. This validates the toolbar against real data before the wider rollout.

**Files:**
- Modify: `apps/dashboard/app/routes/tenant/partners/_index.tsx`
- Modify: `apps/dashboard/app/routes/tenant/listings/_index.tsx`

**Interfaces:**
- Consumes: `readListFilters`, `FilterSpec` (Task 1); `<ListToolbar>` (Task 2); existing `readListParams`, `<StatusFilterTabs>`, `<PaginationBar>`.

- [ ] **Step 1: Add a search spec + toolbar to `tenant/listings/_index.tsx`**

The status tab row stays (it uses server counts). Add a `q` text search above it.

In the loader, replace the hand-rolled status parse with the spec reader. After the existing imports, add:

```ts
import { readListFilters, hasActiveFilters, type FilterSpec } from '~/lib/list-filters';
import { ListToolbar } from '~/components/list-toolbar';
import { dashboardPaths } from '~/constants/paths';

const LISTINGS_FILTER_SPEC: FilterSpec = [
  { kind: 'text', key: 'q', label: 'Tìm kiếm', placeholder: 'Tên listing…' },
];
```

Change the loader body (currently lines ~35-54) to merge `q` alongside the existing `status`:

```ts
  const { toApiQuery } = readListParams(url.searchParams);
  const statusRaw = url.searchParams.get('status') ?? '';
  const status = STATUS_VALUES.includes(statusRaw as PublishStatus) ? statusRaw : '';
  const { filters, apiFilters } = readListFilters(url.searchParams, LISTINGS_FILTER_SPEC);
  const [res, partnersRes] = await Promise.all([
    apiGet<PaginatedWithCounts<ListingResponse>>('/tenant/listings', auth, {
      query: toApiQuery({ status, ...apiFilters }),
    }),
    // ...unchanged partnersRes...
  ]);
  return {
    result: res.ok ? res.data : null,
    partnerNames,
    error: res.ok ? null : (res.error ?? 'Không tải được danh sách listing.'),
    filters: { status, ...filters },
    canModerate: can('tenant.listings.publish'),
  };
```

In the component, add the toolbar above `<StatusFilterTabs>` and pass `pageSize`:

```tsx
      <ListToolbar
        spec={LISTINGS_FILTER_SPEC}
        filters={filters}
        resetHref={dashboardPaths.tenant.listings}
        pageSize={pageSize}
      />
      <StatusFilterTabs
        filters={FILTERS}
        value={statusValue}
        hrefFor={(v) => filterHref({ status: v === 'all' ? undefined : v })}
        counts={counts}
      />
```

Update the `DataTable emptyMessage` to reflect active filters:

```tsx
        emptyMessage={hasActiveFilters(filters) ? 'Không có listing khớp bộ lọc.' : 'Chưa có listing nào.'}
```

> Verify `dashboardPaths.tenant.listings` exists; if the path constant has a different name, use the actual one (`grep "listings" apps/dashboard/app/constants/paths.ts`).

- [ ] **Step 2: Do the same for `tenant/partners/_index.tsx`**

Read the file first. It currently sends only `status` via `<StatusFilterTabs>`. Add the identical `q` text spec (placeholder `'Tên hoặc slug đối tác…'`), thread `apiFilters`/`filters` through the `/tenant/partners` fetch exactly as above, render `<ListToolbar>` above the tabs with `resetHref={dashboardPaths.tenant.partners}`.

- [ ] **Step 3: Typecheck + lint**

Run: `nvm use && pnpm --filter=@booking/dashboard typecheck && pnpm --filter=@booking/dashboard lint`
Expected: PASS.

- [ ] **Step 4: Run the app and verify manually**

Run: `docker compose up -d && pnpm --filter=@booking/dashboard dev` (log in as `owner@studiohub.vn` / `demo-password`).
Verify at `localhost:5174/tenant/listings`:
- Typing in the search box updates the URL `?q=…` after ~300ms and the list re-filters without a button press.
- Switching a status tab preserves `q`; changing `q` resets to page 1.
- "Xoá lọc" clears the search and returns to the unfiltered list.
Repeat at `/tenant/partners`.

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/app/routes/tenant/listings/_index.tsx apps/dashboard/app/routes/tenant/partners/_index.tsx
git commit -m "feat(dashboard): search box on tenant listings + partners via ListToolbar"
```

---

## PHASE 2 — Migrate existing filtered pages onto the toolbar

Each task swaps a page's bespoke `<Form method="get">` markup for `<ListToolbar spec>` + `readListFilters`, **preserving behavior**. Verify each page still filters identically, then commit.

### Task 4: Migrate `admin/tenants`

**Files:** Modify `apps/dashboard/app/routes/admin/tenants/_index.tsx`

- [ ] **Step 1:** Read the file. Define the spec matching its current controls:

```ts
const TENANTS_FILTER_SPEC: FilterSpec = [
  { kind: 'text', key: 'search', label: 'Tìm kiếm', placeholder: 'Tên hoặc slug…' },
  { kind: 'enum', key: 'status', label: 'Trạng thái', options: TENANT_STATUS_OPTIONS },
  { kind: 'enum', key: 'vertical', label: 'Lĩnh vực', options: VERTICAL_OPTIONS },
];
```

Build `TENANT_STATUS_OPTIONS` / `VERTICAL_OPTIONS` from the existing label maps already imported by the page (reuse them — do not hardcode new lists).

- [ ] **Step 2:** In the loader, replace the manual `searchParams.get('search'|'status'|'vertical')` reads with `const { filters, apiFilters } = readListFilters(url.searchParams, TENANTS_FILTER_SPEC);` and pass `toApiQuery(apiFilters)`. Return `filters`.
- [ ] **Step 3:** In the component, delete the bespoke `<Form>` block and render `<ListToolbar spec={TENANTS_FILTER_SPEC} filters={filters} resetHref={dashboardPaths.admin.tenants} pageSize={pageSize} />`.
- [ ] **Step 4:** `nvm use && pnpm --filter=@booking/dashboard typecheck && pnpm --filter=@booking/dashboard lint` → PASS.
- [ ] **Step 5:** Manually verify (log in as `admin@bookify.local`) that search + status + vertical still filter identically. Commit:

```bash
git add apps/dashboard/app/routes/admin/tenants/_index.tsx
git commit -m "refactor(dashboard): migrate admin/tenants filters to ListToolbar"
```

### Task 5: Migrate `admin/disputes` + `tenant/finance/disputes` + `partner/disputes`

**Files:** Modify the three dispute routes.

- [ ] **Step 1:** Shared spec (put it in `features/<area>` or inline per route — three routes, same fields `q` + `status` + `responseStatus`):

```ts
const DISPUTE_FILTER_SPEC: FilterSpec = [
  { kind: 'text', key: 'q', label: 'Tìm kiếm', placeholder: 'Mã đặt chỗ hoặc lý do…' },
  { kind: 'enum', key: 'status', label: 'Trạng thái', options: DISPUTE_STATUS_OPTIONS },
  { kind: 'enum', key: 'responseStatus', label: 'Phản hồi', options: DISPUTE_RESPONSE_OPTIONS },
];
```

Reuse existing dispute label maps for options. (`settlementDisputeFiltersSchema` already supports `q`/`status`/`responseStatus`/`from`/`to`; add a `date-range` field if the page currently exposes dates.)

- [ ] **Step 2-3:** For each route, swap loader parsing to `readListFilters` and the markup to `<ListToolbar>` with the area's `resetHref`.
- [ ] **Step 4:** typecheck + lint → PASS.
- [ ] **Step 5:** Verify each of the 3 pages (admin, tenant, partner logins) filters identically. Commit:

```bash
git add apps/dashboard/app/routes/admin/disputes.tsx apps/dashboard/app/routes/tenant/finance/disputes.tsx apps/dashboard/app/routes/partner/disputes.tsx
git commit -m "refactor(dashboard): migrate settlement-dispute filters to ListToolbar"
```

### Task 6: Migrate `ReviewInbox` (admin/tenant/partner reviews)

**Files:** Modify `apps/dashboard/app/features/reviews/components/review-inbox.tsx` (+ verify its 3 route callers).

- [ ] **Step 1:** `ReviewInbox` is shared across all three review routes. Define its spec (`q` + `responseStatus` + `rating` + optional `from`/`to` date-range per `dashboardReviewFiltersSchema`):

```ts
const REVIEW_FILTER_SPEC: FilterSpec = [
  { kind: 'text', key: 'q', label: 'Tìm kiếm', placeholder: 'Nội dung đánh giá…' },
  { kind: 'enum', key: 'responseStatus', label: 'Phản hồi', options: REVIEW_RESPONSE_OPTIONS },
  { kind: 'enum', key: 'rating', label: 'Điểm', options: RATING_OPTIONS },
  { kind: 'date-range', fromKey: 'from', toKey: 'to', label: 'Ngày' },
];
```

- [ ] **Step 2:** The `resetHref` differs per caller. Add a `resetHref: string` prop to `ReviewInbox` (each route passes its own `dashboardPaths.{admin,tenant,partner}.reviews`). The loaders live in each route's `server` module — move their filter parsing to `readListFilters(searchParams, REVIEW_FILTER_SPEC)` (export the spec from the feature so loaders import it).
- [ ] **Step 3:** Replace the bespoke `<Form>` in `ReviewInbox` with `<ListToolbar spec={REVIEW_FILTER_SPEC} filters={filters} resetHref={resetHref} pageSize={pageSize} />`.
- [ ] **Step 4:** typecheck + lint → PASS.
- [ ] **Step 5:** Verify all three review pages. Commit:

```bash
git add apps/dashboard/app/features/reviews
git commit -m "refactor(dashboard): migrate review inbox filters to ListToolbar"
```

### Task 7: Migrate `FavoritesInbox` (tenant/partner favorites)

**Files:** Modify `apps/dashboard/app/features/favorites/components/favorites-inbox.tsx` (+ its 2 callers).

- [ ] **Step 1:** Spec = `q` + `target` (+ `partnerId` for tenant — pass the spec in as a prop or branch by area so partner omits `partnerId`). Reuse `dashboardFavoriteFiltersSchema` fields.
- [ ] **Step 2-3:** Add `resetHref` prop; parse via `readListFilters`; swap markup to `<ListToolbar>`.
- [ ] **Step 4:** typecheck + lint → PASS.
- [ ] **Step 5:** Verify tenant + partner favorites. Commit:

```bash
git add apps/dashboard/app/features/favorites
git commit -m "refactor(dashboard): migrate favorites inbox filters to ListToolbar"
```

### Task 8: Migrate `PaymentTransactionsPage` + delete `payment-history.ts`

**Files:**
- Modify: `apps/dashboard/app/features/payments/components/payment-transactions-page.tsx`
- Modify: loaders in `apps/dashboard/app/routes/admin/transactions/_index.tsx` and `apps/dashboard/app/routes/tenant/finance/transactions.tsx`
- Delete: `apps/dashboard/app/features/payments/lib/payment-history.ts`

- [ ] **Step 1:** Define the spec (identical fields to `readPaymentHistoryFilters`): `search` + `status` (from `PAYMENT_STATUS_LABEL`) + `kind` (from `PAYMENT_KIND_LABEL`) + `date-range` `from`/`to`. Export it from the payments feature.
- [ ] **Step 2:** In both loaders, replace `readPaymentHistoryFilters(searchParams)` with `readListFilters(searchParams, PAYMENT_FILTER_SPEC)`; `apiFilters` feeds `toApiQuery`. The `PaymentTransactionsPage` prop `filters: PaymentHistoryFilters` becomes `filters: Record<string,string>`.
- [ ] **Step 3:** Replace the page's bespoke `<Form>` (lines 127-177) with `<ListToolbar spec={PAYMENT_FILTER_SPEC} filters={filters} resetHref={resetHref} pageSize={pageSize} />` (keep the `supplementary` slot above it).
- [ ] **Step 4:** Delete `payment-history.ts`; grep for remaining imports and remove them:

Run: `grep -rn "payment-history" apps/dashboard/app`
Expected: no results after cleanup.

- [ ] **Step 5:** typecheck + lint → PASS. Verify admin + tenant transactions filter identically (search, status, kind, date range). Commit:

```bash
git add apps/dashboard/app/features/payments apps/dashboard/app/routes/admin/transactions apps/dashboard/app/routes/tenant/finance/transactions.tsx
git commit -m "refactor(dashboard): migrate payment transactions to ListToolbar; drop payment-history helper"
```

### Task 9: Migrate remaining filtered pages — settlements + ledger

**Files:** Modify `apps/dashboard/app/routes/admin/settlements/_index.tsx`, `apps/dashboard/app/routes/tenant/finance/settlements.tsx`, `apps/dashboard/app/routes/tenant/finance/ledger.tsx`.

- [ ] **Step 1:** Specs:
  - settlements (admin): `status`. settlements (tenant): `status` + `partnerId` (enum from loaded partner list — build options in the loader, pass a per-request spec).
  - ledger: `entryType` (enum) + `date-range` `from`/`to`.
- [ ] **Step 2-3:** Swap parsing to `readListFilters`; swap markup to `<ListToolbar>`. For the partner-id dropdown whose options are dynamic, construct the spec inside the component from a `partnerOptions` loader value.
- [ ] **Step 4:** typecheck + lint → PASS.
- [ ] **Step 5:** Verify the three pages. Commit:

```bash
git add apps/dashboard/app/routes/admin/settlements apps/dashboard/app/routes/tenant/finance
git commit -m "refactor(dashboard): migrate settlements + ledger filters to ListToolbar"
```

---

## PHASE 3 — Backend search + gap-fill pages

Each task: **(a)** extend the contract, **(b)** thread params through the use-case, **(c)** extend the Prisma repo `where`, **(d)** wire the dashboard page. The canonical pattern (from `list-tenants.use-case.ts` → `prisma-tenant.repository.ts`):

```ts
// contract: paginationQuerySchema.extend({ q: z.string().trim().max(200).optional(), status: <enum>.optional(), from: z.string().datetime().optional(), to: z.string().datetime().optional() })
// repo where:
where: {
  ...(params.q ? { OR: [
    { name: { contains: params.q, mode: 'insensitive' } },
    { code: { contains: params.q, mode: 'insensitive' } },
  ]} : {}),
  ...(params.status ? { status: params.status } : {}),
  ...(params.from || params.to ? { createdAt: { gte: params.from, lte: params.to } } : {}),
}
```

All inside the existing `forTenant` tx. After editing contracts: `pnpm --filter=@booking/contracts build`.

### Task 10: Promotions search (tenant + partner)

**Files:**
- Modify: `packages/contracts/src/contracts/promotion.ts` (add `listPromotionsQuerySchema` / `listPartnerPromotionsQuerySchema` — none exists today).
- Modify: `apps/api/src/modules/promotions/application/use-cases/list-promotions.use-case.ts`, `list-partner-promotions.use-case.ts`.
- Modify: `apps/api/src/modules/promotions/infrastructure/repositories/prisma-promotion.repository.ts`.
- Modify: the promotions controllers' `@Query()` DTOs (find via `grep -rn "list-promotions\|Promotions" apps/api/src/modules/promotions/interface`).
- Modify: `apps/dashboard/app/routes/tenant/promotions/_index.tsx`, `apps/dashboard/app/routes/partner/promotions/_index.tsx`.

- [ ] **Step 1: Add the contract query schema.** In `promotion.ts`:

```ts
import { paginationQuerySchema } from './common';

/** `GET /tenant/promotions` — paginated with name/code search + lifecycle status. */
export const listPromotionsQuerySchema = paginationQuerySchema.extend({
  q: z.string().trim().max(200).optional(),
  status: z.enum(['active', 'scheduled', 'expired']).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});
export type ListPromotionsQuery = z.infer<typeof listPromotionsQuerySchema>;
export const listPartnerPromotionsQuerySchema = listPromotionsQuerySchema;
export type ListPartnerPromotionsQuery = ListPromotionsQuery;
```

Export both from `packages/contracts/src/index.ts` (follow how `listPartnersQuerySchema` is re-exported).

> **Verify the `status` semantics against the schema first.** Read `prisma-promotion.repository.ts` + the promotion model: if promotions have no stored status column, derive `active/scheduled/expired` from the time-window columns (`startsAt`/`endsAt` vs now) in the repo. If a stored status/enum exists, filter on it directly. This is the one non-mechanical decision in Phase 3 — resolve it before writing the `where`.

- [ ] **Step 2: Build contracts.** Run: `pnpm --filter=@booking/contracts build` → PASS.
- [ ] **Step 3: Thread the use-case params.** Add `q`/`status`/`from`/`to` to the list use-cases' input params and pass them to the repo method (mirror `list-tenants.use-case.ts`).
- [ ] **Step 4: Extend the repo `where`** (name + code `contains insensitive`; status per Step 1's decision; `createdAt` date range) — inside the existing `forTenant` tx, alongside the existing tenant/partner scoping.
- [ ] **Step 5: Update the controller `@Query()` DTO** to `createZodDto(listPromotionsQuerySchema)`.
- [ ] **Step 6: Backend verify.** Run: `pnpm --filter=@booking/api typecheck && pnpm --filter=@booking/api build` → PASS. Run: `pnpm --filter=@booking/api check:rls` → PASS (no new tables, must stay green).
- [ ] **Step 7: Wire the dashboard pages.** Add spec `[{text q}, {enum status: active/scheduled/expired}, {date-range from/to}]`, `readListFilters`, `<ListToolbar>` to both promotions routes (they have no filters today).
- [ ] **Step 8:** `nvm use && pnpm --filter=@booking/dashboard typecheck && lint` → PASS. Manually verify search/status/date on tenant + partner promotions (owner + partner logins).
- [ ] **Step 9: Commit.**

```bash
git add packages/contracts apps/api/src/modules/promotions apps/dashboard/app/routes/tenant/promotions apps/dashboard/app/routes/partner/promotions
git commit -m "feat(promotions): add name/code search + status/date filters (API + dashboard)"
```

### Task 11: Listing-groups + listing-types name search

**Files:**
- Modify: `packages/contracts/src/contracts/listing.ts` (add `q` to the listing-groups query) and the listing-types contract.
- Modify: `apps/api/src/modules/listing/application/use-cases/list-listing-groups.use-case.ts` + `prisma-listing-group.repository.ts`; `apps/api/src/modules/catalog/application/use-cases/list-listing-types.use-case.ts` + `prisma-listing-type.repository.ts`; their controllers' DTOs.
- Modify: `apps/dashboard/app/routes/tenant/listing-groups/_index.tsx`, `apps/dashboard/app/routes/tenant/listing-types/_index.tsx`.

- [ ] **Step 1:** Add `q: z.string().trim().max(200).optional()` to each list-query schema (create the schema if the endpoint has none — follow the `listTenantListingsQuerySchema` shape). `pnpm --filter=@booking/contracts build`.
- [ ] **Step 2:** Thread `q` through both use-cases; repo `where` gets `name: { contains: q, mode: 'insensitive' }` inside `forTenant`.
- [ ] **Step 3:** Update both controller DTOs. Backend `typecheck && build && check:rls` → PASS.
- [ ] **Step 4:** Wire both dashboard pages with a single `{text q}` spec + `<ListToolbar>`.
- [ ] **Step 5:** typecheck + lint + manual verify. Commit:

```bash
git add packages/contracts apps/api/src/modules/listing apps/api/src/modules/catalog apps/dashboard/app/routes/tenant/listing-groups apps/dashboard/app/routes/tenant/listing-types
git commit -m "feat(listing): add name search to listing-groups + listing-types (API + dashboard)"
```

### Task 12: Affiliate commissions + links search

**Files:**
- Modify: `packages/contracts/src/contracts/affiliate.ts`.
- Modify: `apps/api/src/modules/affiliate/application/use-cases/list-affiliate-commissions.use-case.ts` + `prisma-affiliate-commission.repository.ts`; `list-affiliate-links.use-case.ts` + `prisma-referral-link.repository.ts`; their controller DTOs.
- Modify: `apps/dashboard/app/routes/affiliate/commissions.tsx`, `apps/dashboard/app/routes/affiliate/links.tsx`.

- [ ] **Step 1:** Contracts — commissions: `q` (code/booking ref) + `status` + `from`/`to`; links: `q` (code/label). `pnpm --filter=@booking/contracts build`.
- [ ] **Step 2-3:** Use-case params + repo `where` (`OR` over code + booking ref / label; status; `createdAt` range) inside `forTenant`. Controller DTOs. Backend `typecheck && build && check:rls` → PASS.
- [ ] **Step 4:** Wire both pages with `<ListToolbar>`.
- [ ] **Step 5:** typecheck + lint + manual verify. Commit:

```bash
git add packages/contracts apps/api/src/modules/affiliate apps/dashboard/app/routes/affiliate
git commit -m "feat(affiliate): add search/status/date filters to commissions + links (API + dashboard)"
```

### Task 13: Bookings search + date (tenant + partner) and migrate `partner/bookings` to URL-driven

**Files:**
- Modify: `packages/contracts/src/contracts/booking.ts` (`tenantBookingsQuerySchema` — add `q` + `from`/`to`; check whether a partner-bookings query schema exists and extend/create it).
- Modify: `apps/api/src/modules/booking/application/use-cases/list-tenant-bookings.use-case.ts` (+ the partner bookings use-case) + `prisma-booking.repository.ts`; controllers' DTOs.
- Modify: `apps/dashboard/app/routes/tenant/bookings/_index.tsx`, `apps/dashboard/app/routes/partner/bookings/_index.tsx`.

- [ ] **Step 1:** Contract — add `q` (customer name/email + booking ref) + `from`/`to` to the bookings query schemas (status already exists). `pnpm --filter=@booking/contracts build`.
- [ ] **Step 2-3:** Use-case params + repo `where`: `OR` over booking `code` + related customer `name`/`email`; `startAt`/`createdAt` date range (pick the column the page's date semantics imply). Keep the existing status + `partnerId` filters. Inside `forTenant`. Controller DTOs. Backend `typecheck && build && check:rls` → PASS.
- [ ] **Step 4:** `tenant/bookings` keeps its status tabs; add `{text q}` + `{date-range from/to}` toolbar above them.
- [ ] **Step 5: Migrate `partner/bookings` off client-side `useState`.** Replace the fixed-window fetch + `useState` status filter with a URL-driven loader: read `status` + `q` + `from`/`to` via `readListFilters`, pass to `toApiQuery`, render status tabs (or a status enum in the toolbar) + `<ListToolbar>`. Remove the `useState` filter and the fixed date window.
- [ ] **Step 6:** typecheck + lint + manual verify both booking pages (owner + partner logins): search by customer/ref, date range, status all URL-driven; back/forward navigates filters. Commit:

```bash
git add packages/contracts apps/api/src/modules/booking apps/dashboard/app/routes/tenant/bookings apps/dashboard/app/routes/partner/bookings
git commit -m "feat(booking): add search/date filters + make partner bookings URL-driven (API + dashboard)"
```

### Task 14 (optional): `admin/plans`

Small, effectively-static list — low value. **Decision point:** if the seeded plan list is short (a handful of rows), **skip** and note it in the PR description. Otherwise add a `{text q}` name search following Task 11's pattern (contract + use-case + repo + page).

---

## PHASE 4 — Final verification

### Task 15: Full-suite check + doc update

- [ ] **Step 1:** Run the full check suite:

Run: `nvm use && pnpm turbo lint typecheck build`
Expected: PASS across all packages (CI runs lint/typecheck/build on the two frontends + `check:rls`).

- [ ] **Step 2:** RLS coverage (no new tables, must stay green):

Run: `pnpm --filter=@booking/api check:rls`
Expected: PASS.

- [ ] **Step 3:** Smoke-test every list page in the running app (admin/tenant/partner/affiliate logins) — each has a working search/filter toolbar, filters are URL-driven, pagination resets to page 1 on filter change and preserves page size.
- [ ] **Step 4:** Update `docs/conventions.md` (frontend section) with a short "List pages: filter spec + `<ListToolbar>`" convention pointing at `list-filters.ts` + `list-toolbar.tsx` as the standard, so new list pages follow it. Commit:

```bash
git add docs/conventions.md
git commit -m "docs: document ListToolbar + filter-spec convention for dashboard list pages"
```

---

## Self-Review notes

- **Spec coverage:** §2 architecture → Tasks 1-2; §2.3 components → Task 2; §3 backend endpoints → Tasks 10-13 (promotions, listing-groups, listing-types, affiliate commissions/links, bookings) + wire-existing (partners/listings) → Task 3; §4 per-page rollout → Tasks 3-13; §5 phasing → phase headers; §6 out-of-scope (sort, presets, storefront) → not tasked; §7 open questions → promotions status (Task 10 Step 1), admin/plans (Task 14).
- **Type consistency:** `FilterSpec`/`FilterField`/`readListFilters`/`hasActiveFilters`/`boundIso` defined in Task 1 and consumed by that exact name in Tasks 2-13; `<ListToolbar>` prop shape (`spec`,`filters`,`resetHref`,`pageSize`,`actions?`) defined in Task 2 and used identically thereafter.
- **No tests:** every task verifies via typecheck/lint/build + manual run, per ADR 0005.
