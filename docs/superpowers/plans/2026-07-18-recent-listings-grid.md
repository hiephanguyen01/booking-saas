# Recent Listings Grid Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `/account/recent` with the same catalog-driven tabs, responsive grid, and `ListingCard` presentation used by Favorites, without removal or favorite controls.

**Architecture:** Extract the dev/demo account-listing fixture loader into a neutral helper shared by Favorites and Recent. The Recent route loads data server-side, gets tenant listing types from the account outlet context, and filters the loaded items client-side. Production continues to return an empty list because there is no recent-history API.

**Tech Stack:** React Router 8 framework mode, React 19, TypeScript, Tailwind CSS, i18next.

## Global Constraints

- Do not add test files or test scripts, per ADR 0005.
- Do not fetch authenticated/backend data from the browser.
- Production must not display mock recently viewed data.
- Preserve all unrelated worktree changes, especially `booking-column.tsx`.

---

### Task 1: Share account listing fixtures

**Files:**
- Create: `apps/storefront/app/features/account/account-listing-item.ts`
- Create: `apps/storefront/app/features/account/server/account-listings.server.ts`
- Modify: `apps/storefront/app/routes/account/favorites.tsx`
- Delete: `apps/storefront/app/features/account/favorite-listings.ts`
- Delete: `apps/storefront/app/features/account/server/favorite-listings.server.ts`

**Interfaces:**
- Produces: `AccountListingItem` and `loadAccountListingItems(request: Request): Promise<AccountListingItem[]>`.
- Consumes: `loadHomeCatalog(request)` and `accountMocksEnabled()`.

- [ ] Move the existing six presentation fixtures and original-price calculation into the neutral server helper.
- [ ] Update Favorites to consume the neutral helper without changing its rendered UI or behavior.
- [ ] Confirm production still returns an empty array and loader failures degrade to an empty array.

### Task 2: Rebuild Recently Viewed

**Files:**
- Modify: `apps/storefront/app/routes/account/recent.tsx`
- Modify: `packages/i18n/src/locales/vi/account.ts`
- Modify: `packages/i18n/src/locales/en/account.ts`

**Interfaces:**
- Consumes: `loadAccountListingItems`, `AccountOutletContext`, `ListingCard`, and `storefrontPaths.home(locale)`.
- Produces: a loader returning `{ locale, items }` and a tab-filtered responsive listing grid.

- [ ] Replace `mockListings()` and the horizontal account panels with the shared account-listing loader and `ListingCard` grid.
- [ ] Render “All” plus tenant listing-type tabs with horizontal overflow on narrow screens.
- [ ] Keep cards read-only: no remove button and no favorite control.
- [ ] Add a Recent-specific empty state with a link back to Home.
- [ ] Add Vietnamese and English strings for the tab label, all-tab label, and explore action.

### Task 3: Verify

**Files:** None.

- [ ] Run `pnpm --filter=@booking/i18n build`; expect exit code 0.
- [ ] Run `pnpm --filter=@booking/storefront lint`; expect exit code 0.
- [ ] Run `pnpm --filter=@booking/storefront typecheck`; report unrelated pre-existing errors separately.
- [ ] Run `pnpm --filter=@booking/storefront build`; expect exit code 0.
- [ ] Run the storefront and verify desktop 3-column, tablet 2-column, mobile 1-column, horizontal tab scrolling, listing navigation, production empty behavior, and unchanged Home/Favorites rendering.
