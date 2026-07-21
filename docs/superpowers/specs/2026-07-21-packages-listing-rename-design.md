# Design — Render the package UI by booking selection, not listing type

**Date:** 2026-07-21
**Area:** `apps/storefront`
**Status:** Approved, ready for implementation plan

## Problem

Commit `2a818b6` (teammate `hiepnh`, currently `HEAD` on `origin/main`) added a
package-based booking UI under `apps/storefront/app/features/photographer/` and
selected it with the wrong discriminant:

```ts
// features/listing/listing-page.tsx:40
if (listing.listingTypeSlug === 'photography') {
  return <PhotographerPage loaderData={loaderData} />;
}
```

The package UI is a function of the **booking selection**, not the listing type.
The schema defines the real signal:

```prisma
enum BookingSelection {
  flexible_duration
  fixed_packages
}
```

Tying it to the `photography` listing-type slug breaks two cases:

- A `fixed_packages` listing that is **not** `photography` → gets the wrong
  (flexible/room) UI.
- A `photography` listing that uses `flexible_duration` → gets the wrong
  (package) UI.

The `photographer` name is a misnomer for the `fixed_packages` renderer, and it
leaks a specific listing type into structural code and i18n.

## Decisions

- **Replacement name:** `packages` — aligns with existing vocabulary
  (`lib/package-options.ts`, `PublicPackageOption`, `packagesForMode`,
  `selectedPackageForListing`) and the `fixed_packages` enum value.
- **Git strategy:** one new fix commit on top of `main`. No history rewrite, no
  force-push (the branch is shared and already pushed). Commit `2a818b6` keeps
  its photographer traces in history; the working tree ends up clean.

## Change 1 — Fix the discriminant (the actual bug)

`listing.bookingSelection` is already present on `PublicListingDetailResponse`
(the loader reads it at `routes/listing.tsx:88`), so no contract or backend
change is needed.

| File | Before | After |
| --- | --- | --- |
| `features/listing/listing-page.tsx:40` | `listing.listingTypeSlug === 'photography'` | `listing.bookingSelection === 'fixed_packages'` |
| `routes/listing.tsx:127` (related-listings gate) | `listing.listingTypeSlug === 'photography'` | `listing.bookingSelection === 'fixed_packages'` |

Result: every `fixed_packages` listing gets the package UI; every
`flexible_duration` listing (including `photography` ones) gets the room/flexible
UI.

## Change 2 — Rename `photographer` → `packages`

Move `features/photographer/` → `features/packages/`:

| Old file · export | New file · export |
| --- | --- |
| `photographer-page.tsx` · `PhotographerPage` | `package-listing-page.tsx` · `PackageListingPage` |
| `photographer-booking-dialog.tsx` · `PhotographerBookingDialog` | `package-booking-dialog.tsx` · `PackageBookingDialog` |
| `photographer-packages.tsx` · `PhotographerPackages` | `package-table.tsx` · `PackageTable` |
| `photographer-albums.tsx` · `PhotographerAlbums` | `package-albums.tsx` · `PackageAlbums` |
| `photographer-reviews.tsx` · `PhotographerReviews` | `package-reviews.tsx` · `PackageReviews` |
| `related-photographers.tsx` · `RelatedPhotographers` | `related-listings.tsx` · `RelatedListings` |
| `photographer-data.ts` · `photographerPackages` / `photographerDetails` | `package-data.ts` · `listingPackages` / `packageDetails` |

Also:

- **i18n:** rename the `photographer:` namespace → `packages:` in
  `packages/i18n/src/locales/en/listing.ts` and `.../vi/listing.ts`; update every
  `t('photographer.xxx')` call → `t('packages.xxx')`.
- **DOM anchors / ids / aria:** `#photographer-packages` → `#packages`,
  `photographer-*-title` → `packages-*-title`, etc.
- Update the import in `features/listing/listing-page.tsx`.

## Scope boundaries (intentionally untouched)

- `routes/account/profile.tsx` `promo-photographer.png` — unrelated static avatar
  placeholder.
- `apps/api/prisma/seed-demo-catalog.ts` photography demo data — legitimate demo
  content for a photography tenant.
- Backend from `d80c35e` (`package-config`, mappers, quote calculator) — correct,
  not touched.
- Photography-specific attribute rows (`editedPhotos`, `rawFiles`,
  `photographyStyle`) stay but remain **conditional**: `packageDetails()` returns
  null when a listing lacks them, so a non-photography package listing simply does
  not render them. Neutralizing that copy is out of scope; the labels keep their
  current wording under the new `packages:` namespace.

## Verification

Per the no-tests policy, verification is:

```bash
pnpm --filter=@booking/storefront typecheck
pnpm --filter=@booking/storefront lint
pnpm --filter=@booking/storefront build
```

Plus a manual check: a `fixed_packages` listing renders the package UI; a
`flexible_duration` listing renders the room/flexible UI.

Single commit:
`fix(storefront): render package UI by booking selection, not listing type`.

## Durable rule for future work

Recorded in `docs/conventions.md`: UI branching and naming must follow the
schema's structural enums (`BookingSelection`, `BookingMode`, `ListingStructure`),
never a specific listing-type slug or vertical name (`photography`, `studio`,
`salon`, …). See that doc for the full rule.
