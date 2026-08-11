# Catalog Result Skeleton Synchronization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the catalog loading skeleton share the exact responsive shell and tenant-configured surface geometry of `SearchResultCard`.

**Architecture:** Introduce a catalog-local layout module containing structural class strings consumed by both the real result card and its skeleton. Move the catalog-specific skeleton out of the generic loading-skeleton module, while preserving existing loading-region semantics in the desktop and mobile catalog pages.

**Tech Stack:** React 19, React Router 8, TypeScript, Tailwind CSS v4, shadcn/Radix primitives.

## Global Constraints

- Do not add tests or test configuration per ADR 0005.
- Keep `SearchResultCard` as the specialized horizontal catalog result card.
- Do not change filters, sorting, pagination, loaders, API contracts, favorite behavior, or discovery cards.
- Keep all authenticated data server-loaded; do not add browser-to-backend fetches.
- Do not add dependencies, migrations, theme schema, or tenant token changes.
- Preserve unrelated working-tree and staging changes; do not commit or stage files.

---

### Task 1: Share the catalog result card geometry

**Files:**
- Create: `apps/storefront/app/features/catalog/components/catalog-result-card-layout.ts`
- Modify: `apps/storefront/app/features/catalog/components/search-result-card.tsx:46-130`

**Interfaces:**
- Produces: `CATALOG_RESULT_CARD_SHELL_CLASS`, `CATALOG_RESULT_PRIMARY_MEDIA_CLASS`, `CATALOG_RESULT_SECONDARY_MEDIA_CLASS`, and `CATALOG_RESULT_CONTENT_CLASS`, all exported strings.
- Consumes: `SURFACE_FRAME` from `~/constants/surfaces`.

- [ ] **Step 1: Create the shared layout module**

```ts
import { SURFACE_FRAME } from '~/constants/surfaces';

export const CATALOG_RESULT_CARD_SHELL_CLASS =
  `${SURFACE_FRAME} relative flex min-h-32 gap-3 overflow-hidden bg-card p-(--sf-surface-pad) md:grid md:h-46 md:min-h-0 md:grid-cols-[248px_120px_minmax(0,1fr)] md:grid-rows-1 md:gap-x-1.5 md:p-0`;

export const CATALOG_RESULT_PRIMARY_MEDIA_CLASS =
  'relative w-28 shrink-0 overflow-hidden rounded-(--sf-image-radius) bg-muted md:h-full md:w-auto md:rounded-none';

export const CATALOG_RESULT_SECONDARY_MEDIA_CLASS =
  'relative hidden grid-rows-2 gap-1.5 bg-muted md:grid';

export const CATALOG_RESULT_CONTENT_CLASS =
  'flex min-w-0 flex-1 flex-col gap-1 py-0.5 pr-0.5 md:justify-center md:gap-3 md:px-5 md:py-4 md:pr-6 md:pl-[18px]';
```

- [ ] **Step 2: Make the real card consume the shared geometry**

Import the four constants. Compose the article shell with its interaction-only classes:

```tsx
<article
  className={cn(
    CATALOG_RESULT_CARD_SHELL_CLASS,
    'group transition-[border-color,box-shadow] hover:border-primary/50',
  )}
>
```

Use the primary, secondary, and content constants on their existing elements, appending only element-specific focus styles to the primary `Link`. Do not change rendering, data, or event handlers.

- [ ] **Step 3: Run focused static checks**

Run:

```bash
git diff --check
pnpm --filter=@booking/storefront lint
pnpm --filter=@booking/storefront typecheck
```

Expected: exit code `0`; no ESLint or TypeScript errors.

---

### Task 2: Move and align the catalog result skeleton

**Files:**
- Create: `apps/storefront/app/features/catalog/components/catalog-result-skeleton.tsx`
- Modify: `apps/storefront/app/components/loading-skeletons.tsx:27-54`
- Modify: `apps/storefront/app/features/catalog/components/catalog-page.tsx:1-30`
- Modify: `apps/storefront/app/features/catalog/components/mobile-catalog-page.tsx:1-40`

**Interfaces:**
- Consumes: the four exported layout strings from `catalog-result-card-layout.ts`.
- Produces: `CatalogResultSkeleton(): ReactElement` for both catalog page variants.

- [ ] **Step 1: Create the catalog-local skeleton**

Implement a local `CatalogSkeletonBlock` wrapper around `Skeleton` that adds `motion-reduce:animate-none`. Render:

- the shared shell;
- the shared primary-media block;
- two desktop secondary-media blocks;
- a 32px mobile / 40px desktop favorite-chip placeholder at the real button coordinates;
- title and location placeholders at the top of the content column;
- rating/bookings and price/unit placeholders using the real card's mobile and desktop alignment.

The root remains `aria-hidden="true"`. Do not add a nested live region because the page already owns `role="status"` and the localized loading label.

- [ ] **Step 2: Remove the obsolete generic skeleton**

Delete only the `CatalogResultSkeleton` export from `apps/storefront/app/components/loading-skeletons.tsx`. Keep `StorefrontSkeleton`, `LoadingRegion`, and every other skeleton unchanged.

- [ ] **Step 3: Update both catalog imports**

Replace:

```ts
import { CatalogResultSkeleton } from '~/components/loading-skeletons';
```

with:

```ts
import { CatalogResultSkeleton } from './catalog-result-skeleton';
```

in both desktop and mobile catalog page components. Preserve the existing pending-state wrappers and item counts.

- [ ] **Step 4: Run focused static checks**

Run:

```bash
git diff --check
pnpm check:frontend-structure
pnpm --filter=@booking/storefront lint
pnpm --filter=@booking/storefront typecheck
```

Expected: exit code `0`; the frontend boundary guard accepts the new catalog-local files.

---

### Task 3: Verify production and responsive behavior

**Files:**
- Inspect only: all files changed in Tasks 1-2.

**Interfaces:**
- Consumes: final implementation from Tasks 1-2.
- Produces: verification evidence; no new code or files.

- [ ] **Step 1: Run the project-approved verification gates**

Run:

```bash
git diff --check
pnpm check:no-tests
pnpm check:frontend-structure
pnpm --filter=@booking/storefront security
pnpm --filter=@booking/storefront lint
pnpm --filter=@booking/storefront typecheck
pnpm --filter=@booking/storefront build
```

Expected: every command exits `0`. Existing non-fatal Vite source-map warnings from `packages/ui` may remain.

- [ ] **Step 2: Inspect runtime at responsive breakpoints**

Open `/vi/t/studio?mode=hourly&q=&location=&guests=1` at approximately 390px, 1024px, and 1440px. Trigger a catalog navigation to observe pending state. Confirm:

- mobile card and skeleton both use a 112px primary image and have no page overflow;
- desktop card and skeleton are 184px high with `248px / 120px / remaining` columns;
- favorite placeholder, title/location, rating/bookings, and price/unit do not jump when data resolves;
- radius, border, shadow, padding, and image radius follow tenant variables;
- filters, sorting, pagination, links, and favorite controls still work.

- [ ] **Step 3: Confirm repository state**

Run `git status --short` and report only the files changed for this work plus any pre-existing user changes. Do not stage or commit.

