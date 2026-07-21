# Rename photographer → packages + fix fixed_packages discriminant — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render the storefront package-booking UI by `listing.bookingSelection === 'fixed_packages'` (not the `photography` listing-type slug), and rename `features/photographer/` → `features/packages/` so no vertical name leaks into structural code.

**Architecture:** Pure storefront-frontend change. The discriminant field `bookingSelection` already exists on `PublicListingDetailResponse` — no contract/backend/migration work. The rename is a `git mv` of one feature folder plus mechanical identifier / i18n-namespace / DOM-id updates and two consumer edits.

**Tech Stack:** React Router 8 (SSR framework mode), TypeScript, `@booking/i18n` (i18next), pnpm workspaces.

## Global Constraints

- **NO TESTS, ever** (ADR 0005). Verification = `typecheck` + `lint` + `build`. Never add `*.spec.*`/`*.test.*`.
- **Node ≥ 22.22.0 required** (`.nvmrc` = 22.22.0). Run `nvm use` first; React Router 8 bails on Node 20.
- **pnpm only** (10.13.1). Never npm/yarn.
- **Replacement name is `packages`** — folder `features/packages/`, exports `Package*`/`PackageListingPage`/`RelatedListings`, i18n namespace `packages:`. Do not use any other name.
- **Storefront import convention is relative paths** (no `~/` alias). Match surrounding files.
- **One commit at the end** (per spec): `fix(storefront): render package UI by booking selection, not listing type`. No force-push. Intermediate tasks do not commit — the rename only typechecks once every file is consistent, so the single verification gate is Task 4.
- **shadcn semantic tokens only** for any styling touched (no change expected here).

## Identifier / file mapping (authoritative — used by every task)

| Old file · export/identifier | New file · export/identifier |
| --- | --- |
| `photographer-page.tsx` · `PhotographerPage` | `package-listing-page.tsx` · `PackageListingPage` |
| `photographer-booking-dialog.tsx` · `PhotographerBookingDialog` | `package-booking-dialog.tsx` · `PackageBookingDialog` |
| `photographer-packages.tsx` · `PhotographerPackages` | `package-table.tsx` · `PackageTable` |
| `photographer-albums.tsx` · `PhotographerAlbums` | `package-albums.tsx` · `PackageAlbums` |
| `photographer-reviews.tsx` · `PhotographerReviews` | `package-reviews.tsx` · `PackageReviews` |
| `related-photographers.tsx` · `RelatedPhotographers` | `related-listings.tsx` · `RelatedListings` |
| `photographer-data.ts` · `PhotographerDetails` (interface) | `package-data.ts` · `PackageDetails` |
| `photographer-data.ts` · `photographerPackages()` | `package-data.ts` · `listingPackages()` |
| `photographer-data.ts` · `photographerDetails()` | `package-data.ts` · `packageDetails()` |
| `photographer-data.ts` · `minimumPackagePrice()` / `packageDurationHours()` | unchanged names |

**DOM id / anchor mapping** (drop the `photographer` vertical prefix → `packages`):

| Old id/anchor | New |
| --- | --- |
| `photographer-albums-title` | `packages-albums-title` |
| `photographer-introduction-title` | `packages-introduction-title` |
| `photographer-packages` (section id) + `href="#photographer-packages"` | `packages` + `href="#packages"` |
| `photographer-packages-title` | `packages-title` |
| `photographer-hourly-step-title` | `packages-hourly-step-title` |
| `photographer-day-step-title` | `packages-day-step-title` |
| `photographer-reviews-title` | `packages-reviews-title` |
| `related-photographers-title` | `related-listings-title` |
| `StudioGallery key={'photographer'}` fallback | `'packages'` |

**i18n:** rename the object key `photographer:` → `packages:` in both locales; every `t('photographer.X')` → `t('packages.X')`.

---

### Task 1: Rename the i18n `photographer` namespace → `packages`

**Files:**
- Modify: `packages/i18n/src/locales/vi/listing.ts` (source shape — object key `photographer:` ~line 61)
- Modify: `packages/i18n/src/locales/en/listing.ts` (`satisfies TranslationShape<typeof viListing>` — object key `photographer:` line 64)

**Interfaces:**
- Consumes: nothing.
- Produces: translation namespace `packages` with the exact same child keys (`albums`, `viewAlbum`, `fromPrice`, `viewPackages`, `servicePackages`, `tableLabel`, `colPackage`, `colRules`, `colPrice`, `colChoice`, `packageDuration`, `photographyStyle`, `editedPhotos`, `rawFilesIncluded`, `rawFilesNotIncluded`, `packageDescriptionFallback`, `selectPackage`, `selectedPackage`, `noPackagesTitle`, `noPackagesBody`, `bookingTitle`, `bookingDescription`, `pickDayInstruction`, `hourlyInstruction`, `reviews`, `allRatings`, `ratingFilter`, `related`). Consumed by Task 2 via `t('packages.*')`.

- [ ] **Step 1: Rename the key in the vi locale (source shape)**

In `packages/i18n/src/locales/vi/listing.ts`, change the single object key `photographer: {` to `packages: {`. Leave all child keys and Vietnamese strings unchanged. (The `photographer` object is the whole block that closes before `group: {`.)

- [ ] **Step 2: Rename the key in the en locale**

In `packages/i18n/src/locales/en/listing.ts`, change the object key `photographer: {` (line 64) to `packages: {`. Leave all child keys and English strings unchanged. Because en `satisfies TranslationShape<typeof viListing>`, both must match — Step 1 + Step 2 keep them aligned.

- [ ] **Step 3: Confirm no other locale namespace references `photographer`**

Run: `rg -n "photographer" packages/i18n/src`
Expected: no matches (only the two keys existed, now renamed). If any remain, they are strings inside values you must leave alone only if they are human copy (e.g. none expected) — otherwise rename the key.

*(No commit — verification happens in Task 4.)*

---

### Task 2: Rename + rewrite the feature folder `photographer/` → `packages/`

**Files:**
- Move: `apps/storefront/app/features/photographer/` → `apps/storefront/app/features/packages/` (7 files, `git mv` each per the mapping table)
- Modify: every moved file (exports, intra-folder imports, helper names, DOM ids, `t('photographer.*')` → `t('packages.*')`)

**Interfaces:**
- Consumes: `t('packages.*')` namespace from Task 1; `PublicPackageOption` / `packagesForMode` from `../../lib/package-options`; `BookingDialogFooter` from `../../components/booking-dialog-footer`; `loader as bookingDataLoader` from `../../routes/listing-booking-data`.
- Produces: `PackageListingPage` (default page export consumed by Task 3), plus `PackageBookingDialog`, `PackageTable`, `PackageAlbums`, `PackageReviews`, `RelatedListings`, and `package-data.ts` helpers `listingPackages()`, `packageDetails()`, `minimumPackagePrice()`, `packageDurationHours()`, interface `PackageDetails`.

- [ ] **Step 1: `git mv` the seven files to their new names**

```bash
cd apps/storefront/app/features
git mv photographer packages
cd packages
git mv photographer-page.tsx           package-listing-page.tsx
git mv photographer-booking-dialog.tsx package-booking-dialog.tsx
git mv photographer-packages.tsx       package-table.tsx
git mv photographer-albums.tsx         package-albums.tsx
git mv photographer-reviews.tsx        package-reviews.tsx
git mv related-photographers.tsx       related-listings.tsx
git mv photographer-data.ts            package-data.ts
```

- [ ] **Step 2: Rewrite `package-data.ts`**

Rename `interface PhotographerDetails` → `PackageDetails`, `export function photographerPackages` → `listingPackages`, `export function photographerDetails` → `packageDetails`. Keep `minimumPackagePrice` and `packageDurationHours` unchanged. The photography-specific attribute reads inside `packageDetails` (`photographyStyle`, `editedPhotos`, `rawFiles`) stay — they return null when absent (conditional content, allowed by the convention). Result:

```ts
import type { PublicListingDetailResponse } from '@booking/contracts';
import { packagesForMode, type PublicPackageOption } from '../../lib/package-options';

export interface PackageDetails {
  style: string | null;
  editedPhotos: number | null;
  rawFiles: boolean | null;
}

export function listingPackages(listing: PublicListingDetailResponse): PublicPackageOption[] {
  return packagesForMode(listing.modeConfig, 'hourly');
}

export function packageDetails(attributes: Record<string, unknown>): PackageDetails {
  const editedPhotos = Number(attributes.editedPhotos);
  return {
    style: typeof attributes.photographyStyle === 'string' ? attributes.photographyStyle : null,
    editedPhotos: Number.isInteger(editedPhotos) && editedPhotos >= 0 ? editedPhotos : null,
    rawFiles: typeof attributes.rawFiles === 'boolean' ? attributes.rawFiles : null,
  };
}

export function minimumPackagePrice(packages: PublicPackageOption[]): string | null {
  if (!packages.length) return null;
  return packages.reduce(
    (lowest, item) => (BigInt(item.price) < BigInt(lowest) ? item.price : lowest),
    packages[0]!.price,
  );
}

export function packageDurationHours(item: PublicPackageOption): number {
  return item.duration / 60;
}
```

- [ ] **Step 3: Rewrite `package-albums.tsx`**

Rename `export function PhotographerAlbums` → `PackageAlbums`. Change DOM id `photographer-albums-title` → `packages-albums-title` (both the `aria-labelledby` and the `<h2 id=...>`). Change `t('photographer.albums')` → `t('packages.albums')` and `t('photographer.viewAlbum', ...)` → `t('packages.viewAlbum', ...)`.

- [ ] **Step 4: Rewrite `package-reviews.tsx`**

Rename `export function PhotographerReviews` → `PackageReviews`. Change DOM id `photographer-reviews-title` → `packages-reviews-title`. Change `t('photographer.reviews')` → `t('packages.reviews')`, `t('photographer.allRatings')` → `t('packages.allRatings')`, `t('photographer.ratingFilter', ...)` → `t('packages.ratingFilter', ...)` (and the `aria-label={t('photographer.reviews')}` occurrence).

- [ ] **Step 5: Rewrite `related-listings.tsx`**

Rename `export function RelatedPhotographers` → `RelatedListings`. Change DOM id `related-photographers-title` → `related-listings-title`. Change `t('photographer.related')` → `t('packages.related')`.

- [ ] **Step 6: Rewrite `package-table.tsx`**

Rename `export function PhotographerPackages` → `PackageTable`. Update the intra-folder import `import { packageDurationHours, photographerDetails } from './photographer-data';` → `import { packageDurationHours, packageDetails } from './package-data';` and both call sites `photographerDetails(listing.attributes)` → `packageDetails(listing.attributes)`. Change the section id `photographer-packages` → `packages` and `photographer-packages-title` → `packages-title` (the `id`, `aria-labelledby`, and `<h2 id=...>`). Replace every `t('photographer.X')` in the file → `t('packages.X')` (covers `servicePackages`, `noPackagesTitle`, `noPackagesBody`, `tableLabel`, `colPackage`, `colRules`, `colPrice`, `colChoice`, `packageDescriptionFallback`, `packageDuration`, `editedPhotos`, `rawFilesIncluded`, `rawFilesNotIncluded`, `selectedPackage`, `selectPackage`).

- [ ] **Step 7: Rewrite `package-booking-dialog.tsx`**

Rename `export function PhotographerBookingDialog` → `PackageBookingDialog`. Change DOM ids `photographer-hourly-step-title` → `packages-hourly-step-title` and `photographer-day-step-title` → `packages-day-step-title`. Replace every `t('photographer.X')` → `t('packages.X')` (`hourlyInstruction`, `pickDayInstruction`, `bookingTitle`, `bookingDescription`). Leave the imports of `BookingDialogFooter`, `package-options`, and `listing-booking-data` unchanged (they are outside this folder and already correct).

- [ ] **Step 8: Rewrite `package-listing-page.tsx`**

Rename `export function PhotographerPage` → `PackageListingPage`. Update all intra-folder imports:

```ts
import { PackageAlbums } from './package-albums';
import { PackageBookingDialog } from './package-booking-dialog';
import { listingPackages, minimumPackagePrice } from './package-data';
import { PackageTable } from './package-table';
import { PackageReviews } from './package-reviews';
import { RelatedListings } from './related-listings';
```

Update usages: `photographerPackages(listing)` → `listingPackages(listing)`; JSX `<PhotographerAlbums …>` → `<PackageAlbums …>`, `<PhotographerPackages …>` → `<PackageTable …>`, `<PhotographerReviews …>` → `<PackageReviews …>`, `<RelatedPhotographers …>` → `<RelatedListings …>`, `<PhotographerBookingDialog …>` → `<PackageBookingDialog …>`. Change the `StudioGallery` fallback `key={selectedPackage?.id ?? 'photographer'}` → `'packages'`, the introduction id `photographer-introduction-title` → `packages-introduction-title`, the CTA `href="#photographer-packages"` → `href="#packages"`, and `t('photographer.viewPackages')` → `t('packages.viewPackages')`.

- [ ] **Step 9: Confirm the folder is free of the vertical name**

Run: `rg -n "[Pp]hotographer" apps/storefront/app/features/packages`
Expected: no matches. (The conditional photography *attribute* reads live in `package-data.ts` as `photographyStyle`/`editedPhotos`/`rawFiles`, which do not contain the substring "photographer" — so zero matches is correct.)

*(No commit — verification happens in Task 4.)*

---

### Task 3: Fix the discriminant in the two consumer sites

**Files:**
- Modify: `apps/storefront/app/features/listing/listing-page.tsx:22` (import) and `:40` (branch)
- Modify: `apps/storefront/app/routes/listing.tsx:126-129` (related-listings gate)

**Interfaces:**
- Consumes: `PackageListingPage` from Task 2; `listing.bookingSelection` on `PublicListingDetailResponse` (already present — read at `routes/listing.tsx:88`).
- Produces: nothing downstream.

- [ ] **Step 1: Update the import in `listing-page.tsx`**

Change line 22 from:

```ts
import { PhotographerPage } from '../photographer/photographer-page';
```

to:

```ts
import { PackageListingPage } from '../packages/package-listing-page';
```

- [ ] **Step 2: Fix the branch in `listing-page.tsx`**

Change the block at line 40:

```ts
  if (listing.listingTypeSlug === 'photography') {
    return <PhotographerPage loaderData={loaderData} />;
  }
```

to:

```ts
  if (listing.bookingSelection === 'fixed_packages') {
    return <PackageListingPage loaderData={loaderData} />;
  }
```

- [ ] **Step 3: Fix the related-listings gate in `routes/listing.tsx`**

Change the `relatedPromise` gate (lines 126-129):

```ts
  const relatedPromise =
    listing.listingTypeSlug === 'photography'
      ? fetchListings(request, relatedSearch).catch(() => [])
      : Promise.resolve([]);
```

to:

```ts
  const relatedPromise =
    listing.bookingSelection === 'fixed_packages'
      ? fetchListings(request, relatedSearch).catch(() => [])
      : Promise.resolve([]);
```

- [ ] **Step 4: Confirm no `'photography'` slug branch or `photographer` import remains in storefront app code**

Run: `rg -n "listingTypeSlug === 'photography'|photographer/photographer|PhotographerPage" apps/storefront/app`
Expected: no matches. (Note: `routes/account/profile.tsx` still references `promo-photographer.png` — that is an unrelated static asset and is intentionally left; it will not match this query.)

*(No commit — verification happens in Task 4.)*

---

### Task 4: Verify and commit

**Files:** none new — verifies Tasks 1-3 and creates the single commit.

**Interfaces:**
- Consumes: all prior tasks.
- Produces: one commit on `main`.

- [ ] **Step 1: Use the correct Node version**

```bash
cd "/Volumes/OVEN Duy/temp/booking-saas"
nvm use   # 22.22.0 from .nvmrc; required or typecheck/build bail
node -v    # expect v22.22.0
```

- [ ] **Step 2: Typecheck the storefront**

Run: `pnpm --filter=@booking/storefront typecheck`
Expected: PASS with no errors. (This runs `react-router typegen && tsc` and is the real gate — it catches any missed import rename, missing export, or stale `photographer` identifier.)

- [ ] **Step 3: Lint the storefront**

Run: `pnpm --filter=@booking/storefront lint`
Expected: PASS (`eslint app`), no errors.

- [ ] **Step 4: Build the storefront**

Run: `pnpm --filter=@booking/storefront build`
Expected: build succeeds.

- [ ] **Step 5: Manual smoke check (running app)**

Start the app (`pnpm --filter=@booking/storefront dev`, or full `pnpm dev`) and confirm:
- A `fixed_packages` listing (e.g. a seeded photography listing) renders the package UI (package table + `PackageBookingDialog`).
- A `flexible_duration` listing renders the room/flexible UI (`BookingPanel`), even if its listing type were `photography`.

- [ ] **Step 6: Commit (single, no force-push)**

```bash
git add apps/storefront packages/i18n
git commit -m "fix(storefront): render package UI by booking selection, not listing type

Package/fixed-package listings were selected by the 'photography'
listing-type slug, mis-rendering every other fixed_packages listing (and
photography listings using flexible_duration). Branch on
listing.bookingSelection === 'fixed_packages' instead, and rename
features/photographer -> features/packages (i18n photographer: -> packages:)
so no vertical name leaks into structural code.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 7: Confirm clean tree**

Run: `git status -sb`
Expected: `## main...origin/main [ahead 2]` (the earlier docs commit + this fix), working tree clean. Do **not** push/force-push — leave pushing to the user.

---

## Self-Review

- **Spec coverage:** Change 1 (discriminant) → Task 3. Change 2 (rename files + i18n + DOM ids) → Tasks 1-2. Scope boundaries (untouched files) → honored in Task 2 Step 9 / Task 3 Step 4 notes. Verification → Task 4. Single-commit + no-force-push → Task 4 Steps 6-7. All spec sections mapped.
- **Placeholder scan:** none — every code step shows the exact before/after.
- **Type consistency:** helper renames (`listingPackages`, `packageDetails`, `PackageDetails`) defined in Task 2 Step 2 and consumed consistently in Steps 6 and 8; component names match the mapping table throughout; `PackageListingPage` produced in Task 2, imported in Task 3 Step 1.
