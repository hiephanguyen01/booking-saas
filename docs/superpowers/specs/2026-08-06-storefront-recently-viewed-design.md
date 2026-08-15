# Storefront "Đã xem gần đây"

## Goal

Make the account menu's **Đã xem gần đây** entry show the listings and studios the visitor actually
opened, so a customer can return to something they were considering without searching for it again.

The route, the page component, the type-filter tabs, the empty state and the `account.recent.*`
translations already exist. Only the data behind them is missing: `loadAccountRecentRoute` returns a
hardcoded `{ locale, items: [] }`, so the page can never show anything. This spec covers the
recording mechanism, the retrieval path, and the three ways a customer controls the list.

## Decisions

| Decision | Choice | Why |
| --- | --- | --- |
| Where history lives | Signed `httpOnly` cookie on the device | No migration, no API module; the storefront already carries a signed-cookie posture and a precedent (`sf_recent` for guest booking codes) |
| What counts as viewed | Listing detail **and** listing-group (studio) detail | `ListingCard` already renders `kind: 'listing' \| 'group'`; a customer who visited a studio expects to find it here |
| Capacity / retention | 12 entries, 30 days | 12 fills four rows of the 3-column grid and keeps the page to 12 upstream reads; 30 days makes "recently" self-expiring |
| Customer controls | Clear all · remove one · clear on logout | The cookie is per-device, so a shared browser must not leak one account's browsing to the next sign-in |

The device cookie's known limits are accepted: history does not follow the customer to another
device, and clearing browser cookies clears it. The cross-account leak that would otherwise follow
from a per-device store is closed by clearing on logout.

## Storage

New module `apps/storefront/app/features/account/server/recently-viewed.server.ts`.

It is deliberately **not** added to the existing `recent.server.ts`, which holds guest booking codes
for "my bookings on this device" — a different concern with a different lifetime and a different
consumer.

- Cookie `sf_viewed`, built with `signedCookie('sf_viewed', 60 * 60 * 24 * 30)`. Going through that
  helper is what makes the cookie httpOnly, path-wide, `SameSite=Lax`, secure in production and
  signed with the rotating session secrets — the posture must not be re-declared locally.
- Payload: a JSON array of keys `"l:<slug>"` (listing) or `"g:<slug>"` (group), newest first,
  capped at 12.
- Every read re-validates: keys must match `/^[lg]:[a-z0-9-]{1,120}$/`, duplicates are dropped
  through a `Set`, and the array is re-capped. The cookie is signed, but the payload is still
  parsed defensively — the same posture `validCodes()` takes in `recent.server.ts`.

Exports:

| Export | Returns | Used by |
| --- | --- | --- |
| `readViewedRefs(request)` | `ViewedRef[]` (`{ kind, slug }`) | account loader |
| `appendViewedCookie(request, ref)` | `string \| null` — `Set-Cookie`, or `null` when `ref` is already first | listing + group loaders |
| `writeViewedCookie(refs)` | `string` | prune, remove-one |
| `clearViewedCookie()` | `string` (`maxAge: 0`) | clear-all, logout |

`appendViewedCookie` returning `null` when nothing would change keeps a plain page refresh from
emitting a redundant `Set-Cookie` on every listing view.

## Recording a view

Two existing loaders gain a cookie header; no new route is introduced.

- `features/listing/server/listing-route.server.ts` — wrap the returned object in
  `data(payload, { headers })` carrying `appendViewedCookie(request, { kind: 'listing', slug })`.
- `features/listing-group/server/listing-group-route.server.ts` — the same with `kind: 'group'`.

This mechanism is already proven in the app: `features/root/server/root-loader.server.ts` sets the
affiliate attribution cookie from a GET loader exactly this way, and the comment block in
`routes/legal.tsx` records that React Router prepends `Set-Cookie` from `loaderHeaders` whether or
not the route exports `headers`. Neither route needs a `headers` export for the cookie alone.

The listing loader returns `auxiliaryData` as an un-awaited promise (streamed reviews + related
listings), so wrapping the payload in `data()` risked breaking that stream. Checked against the
running app: the rendered document still carries its `streamController` chunks, so `data()` is
transparent to streaming and no `headers` export is needed.

## Reading the list

`loadAccountRecentRoute` is rewritten to take `request` and `locale`.

1. `requireCustomerAuth(request, locale)` — the account layout already guards the area, but the
   guard makes this loader correct on its own, matching `loadAccountFavoritesRoute`.
2. `readViewedRefs(request)`.
3. `mapWithConcurrency(refs, 6, …)` calling `fetchListing` / `fetchListingGroup`, mirroring the
   bounded fan-out `catalog.server.ts` already uses for listing types.
4. Each call is guarded, because `publicGetData` returns `null` **only** on 404 and **throws** on
   every other failure — an unguarded upstream hiccup would take the page down.

   The guard is **not** `optionalData`. That helper deliberately rethrows any `Response` with a
   status ≥ 500 so React Router renders the right error boundary, which is correct for one optional
   section of a page but wrong here: this page issues twelve independent reads, and a single
   timeout on any of them would 5xx a list whose whole purpose is convenience. The loader instead
   uses a small local guard that rethrows only `isAbortLikeError(error)` — cancellation must still
   propagate — and treats every other error as "unresolved". Document that departure at the call
   site so it does not read as someone forgetting `optionalData`.
5. Map survivors to `AccountListingItem[]` through the new pure module
   `features/account/lib/recently-viewed-item.ts`. `kind` is not read from the response; the loader
   knows it from which fetch produced the row.
6. Prune: a ref that resolved to `null` (listing unpublished or removed) is dropped from the cookie;
   a ref whose fetch *threw* is kept and simply omitted from this render. A transient backend
   failure must never erase a customer's history. When the pruned list differs from what was read,
   the loader returns `data(payload, { headers: { 'Set-Cookie': writeViewedCookie(kept) } })`.

Order is the cookie's order — most recent first — not the order the fetches resolve in.

### Mapping detail responses to cards

`AccountListingItem` is `{ listing: PublicListingResponse; presentation }`, but the detail responses
are not card-shaped:

- **Group**: `publicListingGroupDetailResponseSchema` carries `listings[].priceFrom`, so the card's
  "from" price is the minimum of the children already present in the response — a presentational
  reduction over data in hand, not a re-implementation of pricing.
- **Listing**: `publicListingDetailResponseSchema` has **no** `priceFrom`. The value is computed
  backend-side by `lowestBasePrice()` and attached only to card-shaped responses. Deriving it in the
  frontend would duplicate a shared pricing kernel, and omitting it would leave studio cards priced
  and listing cards not.

So the detail response gains that one field. A field-level contract fix, no migration, no new
endpoint, no new module:

1. `packages/contracts/src/contracts/listing.ts` — add `priceFrom: z.string().nullable()` to
   `publicListingDetailResponseSchema`.
2. `apps/api/src/modules/listing/application/listing.mapper.ts` — populate it in
   `toPublicListingDetailResponse` from the **raw** `l.modeConfig`, not the sanitized
   `publicModeConfig(…)` beside it. `lowestBasePrice` is already imported in that file for the card
   mapper.
3. Rebuild `@booking/contracts` before the storefront consumes the new field.

`PublicListingDetailResponseDto` needs no edit — it is generated from the schema by `createZodDto`.

`itemLabel` is deliberately *not* added: `ListingCard` never renders it, so the frontend mapper
supplies `null` rather than the backend growing a field nothing reads.

## Customer controls

All three run through a single `action` on the existing `/account/recent` route, submitted with
`useFetcher` so nothing navigates. The action returns `data(…, { headers: { 'Set-Cookie': … } })`;
React Router revalidates the loader and the grid re-renders.

- The action reads its body with `readFormRequestBody`. A direct `request.formData()` is rejected by
  `scripts/architecture/check-storefront-security.mjs`.
- `intent=clear` → `clearViewedCookie()`.
- `intent=remove` with `key` → re-validate the key against the same regex, filter it out,
  `writeViewedCookie(rest)`. An unknown or malformed key is a no-op, not an error.

**Clear-all button** sits in the page header and renders only when the list is non-empty. No
confirmation dialog: the data is a convenience list the customer can rebuild by browsing, and a
modal would cost more than the mistake.

**Per-card remove** adds an optional `removeControl` to `ListingCard`, positioned at `left-4 top-4`
— the favourite heart owns `right-4 top-4`. This follows the card's existing shape: `favoriteControl`
and `presentation` are already optional controls a caller opts into, and `FavoriteListingCard`
forwards it. A new `ListingCardDismissControl` type joins
`features/catalog/lib/listing-card.types.ts`. Only the recently-viewed page passes the prop —
favourites, home, catalog and search keep rendering exactly as they do now.

**Logout** appends a second `Set-Cookie` to the response `logoutAction`
(`features/auth/server/auth-routes.server.ts`) already returns from `destroyUserSession`. Without
this, the next person to sign in on a shared browser sees the previous customer's browsing.

## Translations

`packages/i18n/src/locales/{vi,en}/account.ts` gain, under the existing `recent` block:

- `clear` — the clear-all button label
- `remove` — the per-card button's `aria-label`, interpolating `{title}`, matching how
  `favorites.remove` is written

`@booking/i18n` builds to `dist/`, so it must be rebuilt before the storefront picks the keys up.

## Files

**New (4)**

- `apps/storefront/app/features/account/server/recently-viewed.server.ts` — the cookie
- `apps/storefront/app/features/account/lib/recently-viewed-ref.ts` — the `l:`/`g:` key format,
  shared because the page submits a key back and browser code cannot value-import a `*.server` file
- `apps/storefront/app/features/account/lib/recently-viewed-item.ts` — detail → card
- `apps/storefront/app/features/account/hooks/use-account-recent-page-controller.ts`

**Deleted (1)**

- `apps/storefront/app/features/account/lib/account-listing-item.ts` — the stub loader's
  `{ listing, presentation }` wrapper. Nothing supplies presentation metadata for a viewed item (no
  discount, no distance), so the page now carries `PublicListingResponse[]` and renders exactly like
  the favourites grid.

**Modified**

- `apps/storefront/app/features/account/server/account-recent-route.server.ts` — real loader + action
- `apps/storefront/app/routes/account/recent.tsx` — pass `request`, add `action`
- `apps/storefront/app/features/account/components/recent/account-recent-page.tsx`
- `apps/storefront/app/features/listing/server/listing-route.server.ts`
- `apps/storefront/app/features/listing-group/server/listing-group-route.server.ts`
- `apps/storefront/app/features/catalog/lib/listing-card.types.ts`
- `apps/storefront/app/features/catalog/components/listing-card.tsx`
- `apps/storefront/app/features/favorites/components/favorite-cards.tsx`
- `apps/storefront/app/features/auth/server/auth-routes.server.ts`
- `packages/i18n/src/locales/vi/account.ts`, `packages/i18n/src/locales/en/account.ts`
- `packages/contracts/src/contracts/listing.ts`
- `apps/api/src/modules/listing/application/listing.mapper.ts`

## Verification

ADR 0005 prohibits tests. Verification is the static gate plus running the app.

```bash
pnpm --filter=@booking/contracts build
pnpm --filter=@booking/i18n build
pnpm check:no-tests && pnpm check:module-cycles && pnpm check:frontend-structure \
  && pnpm --filter=@booking/storefront security \
  && pnpm turbo lint typecheck build \
  && pnpm --filter=@booking/api check:rls
```

Manual run on `studiohub.localhost:5173`, signed in as `customer@studiohub.vn`:

1. Open three listing pages and one studio page.
2. `/vi/account/recent` shows all four, most recent first, each with a price.
3. The listing-type tabs filter the grid.
4. Refreshing a listing page twice does not reorder the list or duplicate an entry.
5. The per-card X removes one entry; the grid updates without a page navigation.
6. **Xoá lịch sử** empties the list and the empty state returns.
7. View something, sign out, sign back in — the list is empty.
8. `/en/account/recent` renders the English strings.

## Out of scope

- Cross-device history, and therefore any database table or API endpoint for views.
- Surfacing recently-viewed anywhere outside the account page (a home-page "continue browsing"
  strip is a separate decision).
- Recording views for signed-out visitors. The cookie is written for everyone, but only the account
  page reads it and that page requires a session.
- Partner or tenant view analytics.
