# Dashboard Table Tabs Prop and Row Dividers Plan

**Goal:** Keep dashboard tabs fully config-driven, remove row dividers from every
`DashboardDataTable`, and clean the stray partner-listings text without changing
legacy `DataTable` visuals.

## Global Constraints

- Do not add tests or test configuration.
- Do not edit shadcn primitives under `packages/ui/src/components/ui`.
- Preserve URL-driven tabs, filters, pagination, loaders, actions, and permissions.
- Keep direct `DataTable` callers visually compatible.

### Task 1: Refactor tabs and row divider behavior

**Files:**
- Modify: `apps/dashboard/app/components/dashboard-data-table.tsx`
- Modify: `packages/ui/src/components/data-table/data-table.tsx`
- Modify: `apps/dashboard/app/routes/partner/listings/_index.tsx`

- [ ] Extract an internal generic tabs renderer receiving `activeValue`, `items`, and `ariaLabel`.
- [ ] Render tabs based only on the optional config prop; do not inspect business values or require a non-empty item check.
- [ ] Add `DataTableProps.showRowDividers?: boolean`, defaulting to `true`.
- [ ] Disable all header/body/loading/empty row borders from `DashboardDataTable` with `showRowDividers={false}` while retaining hover states.
- [ ] Remove the stray `heck` text before the partner listings table.
- [ ] Verify tabs, row borders, table-only horizontal overflow, legacy `DataTable` dividers, lint, typecheck, and build without adding tests.
