# Catalog Result Skeleton Synchronization

## Goal

Keep the catalog's specialized horizontal `SearchResultCard`, while making its loading skeleton match the card's responsive geometry and tenant-configured surface exactly.

## Scope

- The desktop and mobile catalog result lists at `/vi/t/:typeSlug`.
- `SearchResultCard` remains the production card and retains its current data, interactions, gallery, favorite control, links, and responsive row layout.
- `CatalogResultSkeleton` is moved into the catalog feature and aligned with the real card.
- Filters, sorting, pagination, loaders, API contracts, and other discovery cards do not change.

## Component Design

Create a small catalog-local layout module containing the shared structural class names for:

- the tenant surface frame and responsive card shell;
- the primary media column;
- the desktop secondary-media strip;
- the content column.

`SearchResultCard` and `CatalogResultSkeleton` both consume these classes. The skeleton remains separate markup because its placeholder blocks differ from real listing content, but the dimensions and responsive layout cannot drift.

Move `CatalogResultSkeleton` from the generic `components/loading-skeletons.tsx` module to `features/catalog/components/catalog-result-skeleton.tsx`. Update desktop and mobile catalog imports accordingly.

## Visual Behavior

- Mobile: minimum height `128px`, primary image width `112px`, tenant surface padding, tenant image radius, and the same compact content rhythm as the real card.
- Desktop from `md`: fixed height `184px`, columns `248px / 120px / remaining`, `6px` gallery gap, no inner surface padding, and the same content insets as the real card.
- The skeleton includes a favorite-chip placeholder at the real control's position and placeholder lines for title, location, rating/bookings, price, and price unit.
- Tenant surface radius, border width/color, shadow, padding, and image radius come from the existing `--sf-surface-*` and `--sf-image-radius` tokens.
- Remove desktop-only hardcodes for `rounded-lg`, `1.4px` border, and `shadow-none`.

## Loading and Accessibility

Existing catalog loading regions retain `role="status"`, `aria-live="polite"`, and localized loading labels. Individual skeletons remain `aria-hidden` to avoid repeated announcements. Reduced-motion behavior continues through `StorefrontSkeleton`.

## Verification

Do not add tests per ADR 0005. Run `git diff --check`, no-tests and frontend-structure guards, storefront security, lint, typecheck, and production build. Inspect real and pending states at approximately 390px, 1024px, and 1440px, including tenant surface overrides, to confirm no layout jump or horizontal overflow.

