# Dashboard Table Tabs and Pagination Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add optional tabs, a borderless table surface, modern pagination, and a correctly paginated unified partner listing feed.

**Architecture:** A new listing-feed repository returns globally ordered standalone/group keys with SQL `UNION ALL`; one use-case bulk-loads the existing records inside one tenant transaction and returns a discriminated union. React Router loaders consume that feed, while `DashboardDataTable` remains a URL-driven presentation wrapper.

**Tech Stack:** NestJS 11, Prisma/PostgreSQL, Zod contracts, React Router 8, React, Tailwind CSS, shadcn/ui.

## Global Constraints

- Do not add test files or test configuration.
- Backend flow stays controller → use-case → repository-port → repository.
- Every operation uses one `TenantDbService.forTenant` transaction.
- Frontend data remains loader/action-driven; no browser API fetch.
- No migration or new dependency.

---

### Task 1: Unified partner listing feed

**Files:**
- Modify: `packages/contracts/src/contracts/listing.ts`
- Create: `apps/api/src/modules/listing/domain/ports/listing-feed-repository.port.ts`
- Create: `apps/api/src/modules/listing/infrastructure/repositories/prisma-listing-feed.repository.ts`
- Create: `apps/api/src/modules/listing/application/use-cases/list-partner-listing-feed.use-case.ts`
- Modify: existing listing/group ports, repositories, mapper, DTO, controller, and module registration

**Interfaces:**
- Produces `PartnerListingFeedItemResponse = { kind: 'single'; item: ListingResponse } | { kind: 'grouped'; item: ListingGroupResponse }`.
- Produces `GET /partner/listings/feed` with `page`, `pageSize`, `q`, `status`, and `listingTypeId`.
- Adds bulk `findByIds(tx, ids)` methods to both existing repository ports.

- [x] Add query and response schemas to contracts.
- [x] Implement a feed-key repository using `UNION ALL`, `created_at DESC, id DESC`, exact total count, partner scope, standalone-only listing rows, and shared filters.
- [x] Implement bulk record loading and a single-transaction use-case that restores SQL key order.
- [x] Register the repository/use-case and expose the protected controller endpoint before `:id`.
- [x] Run contracts and API lint/typecheck/build plus architecture checks.

### Task 2: Shared tabs, borderless surface, and pagination

**Files:**
- Modify: `apps/dashboard/app/components/dashboard-data-table.tsx`
- Modify: `apps/dashboard/app/components/pagination-bar.tsx`
- Modify: `packages/ui/src/components/data-table/data-table.tsx`
- Modify: `packages/ui/src/components/data-table/pagination.tsx`

**Interfaces:**
- Adds `DashboardDataTableTabs` with `activeValue` and URL-backed `{ value, label, href }` items.
- Removes table-owned `title` and `description`.
- Keeps the existing `DashboardDataTablePagination` contract.

- [x] Render accessible optional tabs above the toolbar with an underline active state.
- [x] Remove Card/header ownership and decorative borders while retaining input/select borders and isolated table overflow.
- [x] Refactor pagination copy, active styling, desktop numbered pages, and mobile current/total summary.
- [x] Run UI and dashboard lint/typecheck/build.

### Task 3: Partner listings route integration

**Files:**
- Modify: `apps/dashboard/app/routes/partner/listings/_index.tsx`
- Create: `apps/dashboard/app/features/partner/components/listings/listing-feed-table-columns.tsx`

**Interfaces:**
- URL `view` values are `all`, `single`, and `grouped`; missing/invalid values resolve to `all`.
- Tab hrefs preserve `q`, `status`, `listingTypeId`, and `pageSize`, and remove `page`.

- [x] Render the page heading/description outside `DashboardDataTable`.
- [x] Load the feed endpoint for `all`, standalone listings for `single`, and listing groups for `grouped`.
- [x] Add unified columns that select the correct summary, visibility target, detail path, and action component by discriminator.
- [x] Remove the old “Kiểu bài đăng” select because tabs now own that filter.
- [x] Verify search/filter/tab/page-size URL behavior and empty/error states.

### Task 4: Final verification

- [x] Run `pnpm check:no-tests`, module cycles, frontend structure, storefront security, Turbo lint/typecheck/build, and API RLS checks.
- [x] Validate desktop/mobile tabs, borderless styling, pagination, unified totals, actions, and table-only horizontal scrolling in the running dashboard.
- [x] Review the final diff for compatibility and unintended tracked artifacts.
