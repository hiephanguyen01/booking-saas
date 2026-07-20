# Favorites (Yêu thích)

A customer's **heart** on a `Listing` or a `ListingGroup`. Customers favorite from any storefront
surface; partners and tenants see **who favorited** their targets and the counts in the dashboard.
Built 2026-07-20. Contract: [`packages/contracts/src/contracts/favorite.ts`](../../packages/contracts/src/contracts/favorite.ts).

## Data model

`Favorite` (`favorites` table, tenant-scoped, RLS) — `id`, `tenant_id`, `customer_id`, `partner_id`
(denormalised from the target so the dashboard scopes/counts without a join), nullable `listing_id` /
`group_id`, `created_at`. Exactly one target via a DB `CHECK`; one heart per `(customer, target)` via
two **partial unique** indexes. All FKs `ON DELETE CASCADE` — a favorite is ephemeral, not an audit
row. Migration: `apps/api/prisma/migrations/20260720130000_favorites/`. No denormalised counter and
**no outbox** — counts are computed on read.

## Backend — `apps/api/src/modules/favorites/`

Standard hexagonal module (mirrors `reviews`): `domain/ports` (repository + tenant-reader),
`application/use-cases` (one file each), `application/favorite.mapper.ts`,
`infrastructure/repositories`, audience-split controllers. Endpoints:

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `POST` | `/customer/favorites` | `@AuthenticatedOnly` | Toggle — body `{target, targetId, intent:add\|remove}`, idempotent |
| `GET` | `/customer/favorites` | `@AuthenticatedOnly` | Account "my favorites" grid (cards = `PublicListingResponse`) |
| `GET` | `/customer/favorites/refs` | `@AuthenticatedOnly` | The user's favorited ids `{listingIds, groupIds}` — powers heart state |
| `GET` | `/partner/favorites` `…/summary` | `partner.favorites.read` | Who favorited this partner's targets + KPI |
| `GET` | `/tenant/favorites` `…/summary` | `tenant.favorites.read` | Tenant-wide, optional `partnerId` filter |

Customer flows resolve the tenant by `Host` (like reviews) and run in one `forTenant` tx; dashboard
flows read the scope from `TenantContextService`. `priceFrom` on account cards is computed from
`mode_config` (min across a group's published listings). New permissions `partner.favorites.read` /
`tenant.favorites.read` are in `permission-catalog.ts` **and** the migration (dual-write, so existing
DBs get them without a reseed).

## Storefront — `apps/storefront/`

- `features/favorites/favorites-context.tsx` — `FavoritesProvider` (mounted in `routes/locale-layout.tsx`,
  seeded once from a `GET /customer/favorites/refs` fetch in that layout loader so every child page's
  hearts render correct on SSR) + the `useFavorite(kind, id)` hook.
- **Optimistic + debounced**: a click flips the heart immediately and schedules a **debounced** (350ms)
  per-target write to the `routes/favorites-toggle.tsx` resource route, so rapid clicks / add→remove
  flip-flops coalesce into one request; the optimistic override drops when the layout loader
  revalidates and the server agrees. The debounce timer **and** the write
  (`useSubmit(..., {navigate:false, fetcherKey})`) live in the always-mounted provider — so a write is
  **not lost** if the card that triggered it unmounts (click a heart then navigate away within the
  window), and a per-target `fetcherKey` keeps concurrent toggles from colliding. If a write **fails**
  (expired session / 5xx) the provider watches `useFetchers()` and rolls the heart back to the server
  state. (Known minor edge: switching locale vi↔en *within* the 350ms window unmounts the provider and
  drops that one pending write — rare; the heart resets on remount.)
- **Logged out** → `components/login-required-dialog.tsx` prompts login (returns to the current page);
  the heart does not change.
- Wired everywhere via `components/favorite-cards.tsx` (`FavoriteListingCard`, `FavoriteSearchResultCard`)
  and `components/favorite-heart-button.tsx` (detail headers): home, filter/search, listing detail,
  group detail, account favorites + recent. The account favorites page reads **real** data (the old
  `loadAccountListingItems` mock is no longer used there).
- i18n: `packages/i18n/src/locales/{vi,en}/account.ts` → `favorites.{add,remove,loginRequiredTitle,
  loginRequiredBody,loginCta,loginLater}`.

## Dashboard — `apps/dashboard/`

- `features/favorites/components/favorites-inbox.tsx` — shared KPI header (`StatCard` + `BarRow`
  top targets) + filter form (target/q) + who-favorited table (customer initials, target, when) +
  `PaginationBar`.
- Routes `routes/{partner,tenant}/favorites.tsx` (thin loaders → list + summary in parallel), paths in
  `constants/paths.ts`, nav "Yêu thích" (Heart icon) in `routes/{partner,tenant}/nav.ts`
  (auto-hidden when the membership lacks the permission).

## Notes / possible follow-ups

- Users have no avatar column, so `customerAvatarUrl` is always `null` and the dashboard renders
  initials. Wire a real avatar here if one is added later.
- No public "♥ N" social-proof badge by decision — counts are dashboard-only. If that changes, add a
  denormalised counter + outbox projection rather than aggregating on every storefront read.
