# Dashboard Table Tabs and Pagination Design

## Goal

Extend `DashboardDataTable` with optional URL-driven tabs, remove table-owned page headings and
decorative borders, modernize pagination, and give partner listings an accurately paginated unified
“Tất cả” feed containing standalone listings and listing groups.

## Shared table surface

- `DashboardDataTable` accepts optional tabs with an active value and link-backed items.
- Tabs render above the two-row toolbar and are omitted when not configured.
- Page title and description are owned by the route, not the shared table.
- The shared surface, toolbar, table wrapper, and pagination footer are borderless. Form controls
  keep their normal borders, and row hover/background states provide separation.
- Horizontal overflow remains isolated to the table viewport.

## Partner listing feed

- Tabs are `Tất cả`, `Tin đăng đơn`, and `Tin đăng nhiều hạng mục`.
- Switching tabs preserves search, status, category, and page size while resetting to page 1.
- A new partner feed endpoint returns a discriminated union of existing `ListingResponse` and
  `ListingGroupResponse` values, globally ordered and paginated in PostgreSQL.
- The unified table uses common listing columns and dispatches row actions according to the
  discriminator. Single and grouped tabs keep their specialized columns and existing actions.

## Pagination

- The left side shows the visible range, total count, and rows-per-page selector.
- The right side uses compact previous/next controls and numbered pages with a primary active state.
- Mobile collapses the numbered range to a current-page/total-pages summary while retaining previous
  and next controls.
- Pagination remains URL-driven and outside the table scroll container.

## Constraints

- React Router loaders/actions remain the only frontend data boundary.
- Backend flow remains controller → use-case → repository-port → repository.
- No migration, new table, dependency, or test file is introduced.
- Verification uses lint, typecheck, build, architecture checks, RLS checks, and manual browser
  validation.
