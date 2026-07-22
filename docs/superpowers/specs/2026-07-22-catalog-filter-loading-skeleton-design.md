# Catalog filter loading skeleton

## Goal

Eliminate the visible flash when users search, filter, sort, or paginate the storefront catalog at
`/:locale/t/:typeSlug`. Loading feedback must affect only the results list while the search bar,
filters, result heading, and surrounding page layout remain stable.

## Root cause

`CatalogPage` already replaces the results with four skeleton cards whenever React Router reports
`navigation.state === 'loading'`. Fast loader responses make that pending state too brief to read as
intentional feedback: the skeleton can appear for only a fraction of a frame before the new card tree
replaces it, which users perceive as a flash.

## Design

- Treat only loading navigations whose destination pathname is the current catalog pathname as result
  loading. Unrelated navigations must not activate catalog skeletons.
- Show four skeleton cards matching the dimensions and responsive shape of real search-result cards.
- Once shown, keep the skeleton state visible for at least 250 ms. If the loader resolves sooner, delay
  revealing the new results for the remainder of that interval; do not delay the request itself.
- Keep the search form, filter panel, result title, and result count mounted and visually unchanged.
- Hide pagination while the skeleton is visible so stale page controls cannot be activated.
- Mark the results section `aria-busy="true"` while loading. The skeleton container provides the existing
  localized loading label and its decorative blocks remain hidden from assistive technology.
- Respect reduced-motion through the shared Skeleton component's existing animation behavior; this
  change adds no new motion.

## Component boundary

Add a small catalog-local hook that derives a stable loading boolean from React Router navigation and a
minimum display duration. Keep it in `catalog-page.tsx` because it has one consumer and owns no business
data. No loader, API, contract, or shared UI changes are required.

## Edge cases

- A navigation away from the catalog does not flash catalog skeletons.
- Repeated catalog navigations during the minimum interval keep one continuous loading state.
- The timer is cleared on unmount and cannot update an unmounted component.
- Empty results and pagination render only after the stable loading interval ends.

## Verification

Per the repository's no-tests policy, add no test files. Verify with storefront typecheck, lint, and
build, then manually exercise search, sidebar filters, sorting, and pagination in the local storefront.
