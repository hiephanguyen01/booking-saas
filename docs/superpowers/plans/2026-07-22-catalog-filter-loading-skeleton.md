# Catalog Filter Loading Skeleton Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep catalog search/filter transitions visually stable by showing the existing result-card skeleton for at least 250 ms without replacing the search bar, filters, or heading.

**Architecture:** Derive a catalog-scoped pending signal from React Router's navigation destination, then extend only the visible pending state to a minimum duration with a component-local hook. `CatalogPage` uses that stable signal to switch the result list, expose `aria-busy`, and suppress stale pagination while loading.

**Tech Stack:** React 19 hooks, React Router 8 navigation state, TypeScript, Tailwind CSS, existing `@booking/ui` Skeleton.

## Global Constraints

- Add no test files, test configuration, test scripts, or test CI steps; verification is typecheck, lint, build, and manual app inspection.
- Change only the storefront catalog pending UI; do not change loaders, API requests, contracts, or shared components.
- Show four existing result-card skeletons for at least 250 ms once catalog loading becomes visible.
- Keep search, filters, result heading, and page layout mounted and stable.

---

### Task 1: Stabilize catalog result loading

**Files:**
- Modify: `apps/storefront/app/features/catalog/catalog-page.tsx:15-140`

**Interfaces:**
- Consumes: React Router `useLocation()` and `useNavigation()`.
- Produces: `useStableCatalogLoading(minimumMs: number): boolean`, used only by `CatalogPage`.

- [x] **Step 1: Add the catalog-scoped minimum-duration hook**

Update imports and add the hook near the catalog constants:

```tsx
import { useEffect, useRef, useState } from 'react';
import {
  Link,
  useLocation,
  useNavigation,
  useOutletContext,
  useSearchParams,
} from 'react-router';

const MINIMUM_SKELETON_MS = 250;

function useStableCatalogLoading(minimumMs: number): boolean {
  const location = useLocation();
  const navigation = useNavigation();
  const navigationIsLoading =
    navigation.state === 'loading' && navigation.location?.pathname === location.pathname;
  const [minimumVisible, setMinimumVisible] = useState(false);
  const visibleSince = useRef<number | null>(null);

  useEffect(() => {
    if (navigationIsLoading) {
      if (visibleSince.current === null) visibleSince.current = Date.now();
      setMinimumVisible(true);
      return;
    }

    if (!minimumVisible || visibleSince.current === null) return;

    const remaining = Math.max(minimumMs - (Date.now() - visibleSince.current), 0);
    const timeout = window.setTimeout(() => {
      visibleSince.current = null;
      setMinimumVisible(false);
    }, remaining);

    return () => window.clearTimeout(timeout);
  }, [minimumMs, minimumVisible, navigationIsLoading]);

  return navigationIsLoading || minimumVisible;
}
```

- [x] **Step 2: Use the stable pending signal in `CatalogPage`**

Replace the direct navigation check:

```tsx
const pending = useStableCatalogLoading(MINIMUM_SKELETON_MS);
```

Remove the now-unused component-level `useNavigation()` call.

- [x] **Step 3: Expose the busy state and suppress stale pagination**

Update the results section and pagination condition:

```tsx
<section
  aria-labelledby="search-results-title"
  aria-busy={pending}
  className="min-w-0"
>
```

```tsx
{!pending && search.totalPages > 1 ? (
  <CatalogPagination currentPage={search.page} totalPages={search.totalPages} />
) : null}
```

- [x] **Step 4: Run static verification**

Run:

```bash
pnpm --filter=@booking/storefront typecheck
pnpm --filter=@booking/storefront lint
pnpm --filter=@booking/storefront build
```

Expected: all three commands exit with code 0. No test command is run.

- [x] **Step 5: Verify the catalog interaction in the local storefront**

Open `http://localhost:5173/vi/t/studio?mode=hourly&q=&location=&guests=1` and exercise:

1. Submit a text search.
2. Apply a sidebar filter.
3. Select a sort option.
4. Navigate to page 2.

Expected for every action: the search bar, sidebar, heading, and results column width stay fixed; four skeleton cards replace only the old result cards for at least 250 ms; pagination is absent during loading and returns with the resolved data; no skeleton appears when navigating to a listing detail page.

- [x] **Step 6: Commit the implementation**

```bash
git add apps/storefront/app/features/catalog/catalog-page.tsx docs/superpowers/plans/2026-07-22-catalog-filter-loading-skeleton.md
git commit -m "fix(storefront): stabilize catalog loading skeleton"
```
