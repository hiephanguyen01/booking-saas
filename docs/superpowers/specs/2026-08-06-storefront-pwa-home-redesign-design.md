# Storefront PWA + mobile home redesign

Date: 2026-08-06

Two changes to `apps/storefront`, shipped together because they serve one goal — the customer
storefront should install to a phone home screen and feel like an app once it is there.

1. **PWA**: a tenant-branded web app manifest, iOS meta tags, and a conservative service worker
   with an offline fallback.
2. **Mobile home redesign** to match the supplied mockups, plus an app-style bottom tab bar across
   the storefront on mobile.

Desktop and tablet rendering is unchanged. No existing configuration (ports, CSP, env, tenant
theming, search contract, i18n wiring) is replaced — only extended where the two features need it.

## Constraints this design has to respect

These come from `AGENTS.md`, `apps/storefront/CLAUDE.md`, and the code itself. They are the reason
several obvious-looking shortcuts are not taken.

- **One storefront serves many tenant hosts.** The tenant is resolved per request from the `Host`
  header in `features/root/server/request-security.server.ts`. A static
  `public/manifest.webmanifest` would therefore ship one tenant's brand to every tenant.
- **Every HTML response is `Cache-Control: private, no-store`** and embeds a per-request CSP nonce
  (`applyCachePolicy` / `contentSecurityPolicy`). A service worker that caches documents would store
  signed-in pages on the device, contradicting that posture.
- **The platform host answers GET/HEAD only**, and redirects any path outside
  `PLATFORM_DOCUMENT_PATHS` back to `/vi` or `/en`.
- **Tenant `theme_config` values are untrusted jsonb.** Colors must pass through
  `brandSwatch()` / `sanitizeBrandColor()` from `@booking/ui/lib/brand-theme` before they are
  emitted anywhere.
- **The storefront security gate** (`scripts/architecture/check-storefront-security.mjs`) forbids
  `fetch(` and `process.env` anywhere under `apps/storefront/app`, and requires exactly one
  `resolveStorefront()` call site.
- **The frontend structure gate** (`scripts/architecture/check-frontend-structure.mjs`) allows a
  feature only the folders `components` / `hooks` / `server` / `lib`, caps route modules at 120
  lines, and restricts route modules to React Router route exports.
- **ADR 0005: no tests.** Verification is `lint` + `typecheck` + `build` + the static gates +
  running the app.

---

## Part A — PWA

### A.1 The manifest is a route, not a static file

New feature `app/features/pwa/`:

```
features/pwa/
  lib/manifest.ts                  pure: tenant → manifest object
  server/manifest-route.server.ts  request → Response (application/manifest+json)
  components/pwa-head.tsx          <head> tags
  hooks/use-service-worker.ts      registration / dev de-registration
```

`routes/manifest[.]webmanifest.ts` is a thin adapter exporting only `loader`, registered in
`app/routes.ts` at the top level (locale-free, like `robots.txt` and `sitemap.xml`).

**`lib/manifest.ts`** — a pure function, no request access, so it stays testable by reading:

| Field | Value |
| --- | --- |
| `id`, `scope` | `/` — the origin is the app identity, so each tenant host installs as its own app for free |
| `name` | `tenant.name` |
| `short_name` | `tenant.name` truncated to 12 chars on a word boundary |
| `description` | `tenant.themeConfig.hero?.subtitle`, else omitted |
| `start_url` | `/vi` or `/en`, from the locale the request resolved to |
| `lang` | that same locale |
| `display` | `standalone` |
| `display_override` | `['standalone', 'minimal-ui', 'browser']` |
| `orientation` | `portrait-primary` |
| `theme_color` | `brandSwatch(themeConfig.colors?.primary, BRAND_DEFAULTS.primary).color` |
| `background_color` | `brandSwatch(themeConfig.colors?.background, BRAND_DEFAULTS.background).color` |
| `icons` | `themeConfig.faviconUrl` when present, declared `sizes: 'any'`; always followed by the platform PNG set below |
| `categories` | `['travel', 'lifestyle', 'business']` |

Two notes on `icons`. A tenant favicon is a single unknown-dimension URL, so it is declared
`sizes: "any"` with `purpose: "any"` rather than claimed to be 192 or 512 — a lie there makes
Chrome reject the icon. The platform PNG set (`/pwa/icon-192.png`, `/pwa/icon-512.png`,
`/pwa/icon-maskable-512.png`) is **always** appended, which is what guarantees installability even
for a tenant that configured no favicon, and what supplies the maskable variant Android needs to
avoid a white square inside the adaptive-icon mask.

`start_url` is locale-aware because a bare `/` would 302 through the locale layout on every launch.
It is derived with the existing `resolveLocale(request, 'vi')` helper.

**`server/manifest-route.server.ts`** reads the tenant with `getOptionalStorefrontTenant()` from
`lib/server/request-context.server.ts` — the tenant is already resolved by the root middleware, so
this adds no backend call and does not touch the single-`resolveStorefront()` rule. When the tenant
is absent the host is the platform landing, and the BookingOS platform manifest (name "BookingOS",
`BRAND_DEFAULTS` colors, platform icons) is returned instead.

Response headers: `Content-Type: application/manifest+json; charset=utf-8`. The root middleware
will stamp `Cache-Control: private, no-store` on it like every other response — correct here,
because the body varies by `Host` and by the locale cookie, and the middleware already appends
`Vary: Cookie`.

### A.2 One-line change to the platform host allowlist

`PLATFORM_DOCUMENT_PATHS` in `request-security.server.ts` gains `/manifest.webmanifest`. Without
it the platform host 302s the manifest request to `/vi` and BookingOS itself is not installable.
Tenant hosts need no allowlist entry — they never had one.

### A.3 `<head>` tags

`features/pwa/components/pwa-head.tsx` renders, and `StorefrontDocument` mounts it inside `<head>`:

- `<link rel="manifest" href="/manifest.webmanifest">`
- `<link rel="apple-touch-icon" href={faviconUrl ?? '/pwa/icon-192.png'}>` — iOS ignores the
  manifest's icons entirely, so this tag is what puts an icon on an iPhone home screen
- `<meta name="theme-color" content={…}>` — the sanitized primary, so the Android status bar and
  the iOS 16.4+ standalone header take the tenant brand
- `<meta name="apple-mobile-web-app-capable" content="yes">` and
  `<meta name="mobile-web-app-capable" content="yes">`
- `<meta name="apple-mobile-web-app-status-bar-style" content="default">`
- `<meta name="apple-mobile-web-app-title" content={shortName}>`
- `<meta name="application-name" content={shortName}>`

`StorefrontDocument` currently receives only `locale` and `faviconUrl`. It gains `themeColor` and
`appTitle`, both computed in `root.tsx`'s `Layout` from the root loader data it already reads, and
both `null` on the platform host so the BookingOS defaults apply. The existing `faviconUrl` link
stays exactly as it is.

The viewport meta becomes `width=device-width, initial-scale=1, viewport-fit=cover`. `viewport-fit`
is what makes `env(safe-area-inset-*)` non-zero, which the bottom nav in Part B needs to clear the
iPhone home indicator in standalone mode.

### A.4 Service worker

`public/sw.js`, plain JavaScript with no build step — it is served straight from `public/`, which
also keeps it outside `apps/storefront/app` and therefore outside the security gate's `fetch(` ban
(a service worker without a `fetch` handler is not installable).

Cache name is version-stamped (`bookingos-sf-v1`), so a bumped version evicts everything on
activate.

| Request | Strategy |
| --- | --- |
| Non-GET, or cross-origin | not intercepted at all |
| `request.mode === 'navigate'` | network-first; **never written to any cache**; on network failure serve the precached `/offline.html` |
| `/assets/*`, `/pwa/*` | cache-first, then network + cache-put. Vite hashes these filenames, so they are immutable |
| Everything else | `return` without calling `respondWith` — the browser handles it normally |

That last row is deliberately broad. It covers React Router `.data` requests, `/uploads/*/presign`,
`/set-locale`, `/healthz`, `/readyz`, `/manifest.webmanifest`, and every S3/MinIO image origin.
Intercepting any of them buys nothing and risks serving one visitor's data to another.

`install` precaches `/offline.html` and the three platform icons, then `skipWaiting()`. `activate`
deletes caches whose name is not the current version, then `clients.claim()`. A `message` handler
accepts `{ type: 'SKIP_WAITING' }` so a future update prompt has something to call.

**`public/offline.html`** is a static, self-contained page: inline `<style>`, no scripts (the CSP's
`script-src-attr 'none'` forbids inline handlers, and an external script would defeat the purpose),
no tenant data of any kind — the worker cannot know which tenant the failed navigation belonged to.
Copy is bilingual, Vietnamese first, and the only action is `<a href="/">` so no JavaScript is
needed to retry.

**`public/pwa/icon-{192,512}.png` + `icon-maskable-512.png`** are the BookingOS platform mark:
amber `#ffb020` on near-black `#0b0b0d`, matching `BRAND_DEFAULTS`. The maskable variant keeps the
mark inside the inner 80% safe zone. Generated once and committed; no generator script ships.

### A.5 Registration

`features/pwa/hooks/use-service-worker.ts` runs in an effect from `StorefrontAppShell` — a normal
module, so no inline script and no CSP nonce is involved.

Registration is gated on `import.meta.env.PROD`. In development the hook instead **unregisters** any
worker it finds and clears its caches, because a worker that caches `/assets/*` fights Vite's HMR
and would leave a stale worker behind on a developer's `localhost` after a single production test.

The hook also guards on `'serviceWorker' in navigator` and swallows registration rejection —
private-mode Firefox and some embedded webviews throw there, and a failed registration must not
break the page.

To verify locally: `pnpm --filter=@booking/storefront build && pnpm --filter=@booking/storefront start`,
then visit a tenant host. `localhost` and its subdomains are secure contexts, so no TLS setup is
needed.

---

## Part B — Bottom tab bar

`features/site-shell/components/site-bottom-nav.tsx` plus
`features/site-shell/hooks/use-site-bottom-nav-controller.ts`, mounted in
`TenantStorefrontAppShell` after `SiteFooter`.

- `fixed inset-x-0 bottom-0 z-30 lg:hidden`, with `pb-[env(safe-area-inset-bottom)]`. `z-30` sits
  under the shadcn dialog/sheet overlay (`z-50`), so a booking sheet still covers it.
- Four items, each a `NavLink` with a lucide icon above an 11px label; active item takes
  `text-primary`, inactive `text-muted-foreground`. Tap targets are the full 56px cell height.
- `<main>` gains `pb-16 lg:pb-0` so the last section is not hidden behind the bar. The existing
  `pb-24` on the home content container is reduced accordingly on mobile.

| Item | Destination |
| --- | --- |
| Trang chủ | `storefrontPaths.home(locale)` |
| Tìm kiếm | `storefrontPaths.catalog(locale, listingTypes[0].slug)` — the storefront's search/filter page. Falls back to `home` when the tenant has no active listing type |
| Đặt chỗ | `storefrontPaths.account.bookings(locale)` when signed in, else the guest lookup `storefrontPaths.bookings(locale)` |
| Tài khoản | `storefrontPaths.account.root(locale)` when signed in, else `storefrontPaths.login(locale, redirectTo)` |

Active detection lives in the controller hook: home matches the locale root exactly, the others
match by path prefix, and "Đặt chỗ" treats both booking paths as the same tab.

A route opts out with `export const handle = { hideBottomNav: true }`, read the same way
`standalone` and `bypassTenantGate` already are in `use-storefront-app-shell-controller.ts`. No
route needs it today — `auth`, `become-partner` and `become-affiliate` are already `standalone` and
render no shell at all — but checkout is the obvious future candidate, so the hook is wired now
rather than retrofitted.

The existing mobile hamburger sheet stays. It holds things the four tabs cannot: listing types,
"Trở thành đối tác", community, logout, the language switch.

---

## Part C — Mobile home redesign

Every change below is scoped to below the `sm` breakpoint. From `sm:` up the emitted classes are
the ones already there.

### C.1 Search card: category tiles

`CategoryPicker` in `features/search/components/search-form-controls.tsx`, `hero` variant only:
below `sm`, a `grid grid-cols-3` of tiles — `ListingTypeGlyph` above the type name, `gap-1`,
`rounded-lg`, active `bg-primary/10 text-primary`, inactive `text-muted-foreground`. From `sm:` up,
the current `flex` scroll row with its `min-w-40` items is unchanged.

Both layouts come from one `ToggleGroup` with responsive utilities — no duplicated DOM, so the
`onSelectType` wiring, `aria-label`, and keyboard behaviour are untouched.

The mockup shows six tiles in two rows, which is what BookingStudio's six listing types produce
naturally. Nothing hardcodes six: a tenant with four types gets 3 + 1, and the grid scrolls
vertically inside the card rather than horizontally.

### C.2 Search card: submit button stops floating

`SearchForm`'s hero variant currently absolutely positions the submit button at `-bottom-6` so it
straddles the card edge, and pays for the overlap with `pb-12` on the card and `pb-18` on
`StudioHero`'s wrapper.

Below `sm` the button becomes a full-width, in-flow `Button` at the end of the card
(`w-full`, no absolute positioning), the card's bottom padding drops to `pb-5`, and the hero
wrapper's to `pb-6`. From `sm:` up all three keep today's values, so the floating button survives
exactly where it is on desktop.

This is one element rendered once, with the absolute positioning applied only from `sm:` — not two
buttons behind `hidden`/`sm:hidden`, which would put two submit controls in one form.

### C.3 `ListingCard` becomes a container query

`features/catalog/components/listing-card.tsx` gets `@container` on its `<article>`, and its
internals size off the **card's own width** instead of the viewport:

| Element | Narrow (`@max-[220px]`) | Default |
| --- | --- | --- |
| card min-height | `min-h-64` | `min-h-80` |
| image | `h-32` | `h-46` |
| body padding | `p-2.5`, `gap-2` | `p-4`, `gap-3` |
| title | `text-sm`, `leading-5` | `text-lg`, `leading-7` |
| heart chip | `size-8`, `right-2 top-2` | `size-10`, `right-4 top-4` |
| rating row | stacks, `text-xs` | row, `text-sm` |

This is the load-bearing decision in Part C, so it is worth stating why a simpler tool does not
work. On a 390px phone the home rail shows two cards at ~165px each **while** the catalog page
shows one card at ~358px. A `sm:` breakpoint cannot distinguish those — it would shrink the catalog
card too. A prop cannot either, because the same card instance must be compact on mobile and
comfortable at `lg` inside one rail. The card's own width is the only signal that separates them,
and Tailwind v4 ships `@container` with arbitrary `@max-[…]` variants natively — no plugin.

Every current caller benefits with no change: the catalog grid, related listings, favorites, and
recently-viewed all keep today's look because their cards are wider than 220px.

### C.4 Top listings rail goes 2-up on mobile

`TopListingsSection`: `CarouselItem` basis changes from `basis-[88%]` to `basis-1/2`, and the
gutter from `pl-5` to `pl-3 sm:pl-5`, matching the mockup's two-across grid while keeping the swipe
affordance. `sm:basis-1/2 md:basis-1/3 lg:basis-1/4` are unchanged. `NearbySection` gets the same
treatment so the two rails stay visually consistent.

### C.5 Recommended section goes row-layout on mobile

`ListingCard` gains an optional `layout?: 'stacked' | 'responsive-row'` (default `'stacked'`,
so no existing caller changes). Under `responsive-row` the card renders image-left / text-right
below `sm` and reverts to the stacked layout from `sm:` up:

- `<article>`: `flex-row sm:flex-col`
- image wrapper: `w-28 shrink-0 self-stretch h-auto sm:h-46 sm:w-auto`
- body: `flex-1 min-w-0`
- heart: stays absolutely positioned top-right of the article

`RecommendedSection` passes `layout="responsive-row"` and its grid becomes
`grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4` (it already is — only the gap tightens
on mobile). The location tabs above it keep their current underline treatment, which already
matches the mockup; only the horizontal padding tightens so three tabs fit a 390px screen without
scrolling.

One DOM tree, one favorite button, one link — the alternative (`hidden sm:grid` next to
`sm:hidden`) would double the markup, double the `useFavorite` subscriptions, and give screen
readers every listing twice.

### C.6 Hero proportions

`StudioHero`'s image band goes `h-56 sm:h-68` and the card's pull-up `-mt-38 sm:-mt-42`, so the
taller mobile search card does not push the fold past the viewport. Title and subtitle sizes are
unchanged.

---

## Part D — i18n

New keys, added to **both** `vi` and `en` (the `TranslationShape` type makes a missing English key
a typecheck failure):

- `navigation`: `bottomNav.home`, `bottomNav.search`, `bottomNav.bookings`, `bottomNav.account`,
  `bottomNavLabel` (the `<nav aria-label>`).
- No new `common` keys — the redesigned home reuses `home.*` as-is.

`public/offline.html` is outside the React tree and cannot use i18next, so it carries Vietnamese and
English copy side by side as static markup.

---

## Files touched

**New**

```
apps/storefront/app/features/pwa/lib/manifest.ts
apps/storefront/app/features/pwa/server/manifest-route.server.ts
apps/storefront/app/features/pwa/components/pwa-head.tsx
apps/storefront/app/features/pwa/hooks/use-service-worker.ts
apps/storefront/app/routes/manifest[.]webmanifest.ts
apps/storefront/app/features/site-shell/components/site-bottom-nav.tsx
apps/storefront/app/features/site-shell/hooks/use-site-bottom-nav-controller.ts
apps/storefront/public/sw.js
apps/storefront/public/offline.html
apps/storefront/public/pwa/icon-192.png
apps/storefront/public/pwa/icon-512.png
apps/storefront/public/pwa/icon-maskable-512.png
```

**Modified**

```
apps/storefront/app/routes.ts                                          + manifest route
apps/storefront/app/features/root/server/request-security.server.ts    + allowlist entry
apps/storefront/app/features/root/components/storefront-document.tsx   + PWA head, viewport-fit
apps/storefront/app/features/root/components/storefront-app-shell.tsx  + bottom nav, SW hook, main padding
apps/storefront/app/features/root/hooks/use-storefront-app-shell-controller.ts  + hideBottomNav handle
apps/storefront/app/root.tsx                                           + themeColor/appTitle to Layout
apps/storefront/app/features/search/components/search-form-controls.tsx  category tile grid
apps/storefront/app/features/search/components/search-form.tsx           in-flow mobile submit
apps/storefront/app/features/home/components/hero.tsx                    mobile proportions
apps/storefront/app/features/home/components/home.tsx                    mobile gaps/padding
apps/storefront/app/features/home/components/top-listings-section.tsx    2-up rail
apps/storefront/app/features/home/components/nearby-section.tsx          2-up rail
apps/storefront/app/features/home/components/recommended-section.tsx     row layout, gaps
apps/storefront/app/features/catalog/components/listing-card.tsx          @container + layout prop
packages/i18n/src/locales/vi/navigation.ts                               bottomNav keys
packages/i18n/src/locales/en/navigation.ts                               bottomNav keys
```

## Explicitly out of scope

- **Offline reading of pages already visited.** It would mean caching HTML that carries the signed-in
  visitor's name, email and bookings, against the storefront's `private, no-store` posture.
- **Push notifications, background sync, install prompts (`beforeinstallprompt`).** None is needed
  for installability; each is its own feature.
- **Desktop and tablet layout.** Untouched by design.
- **The dashboard.** It is Vietnamese-hardcoded, staff-facing, and not an install target.
- **A `search` route.** The bottom nav's search tab points at the existing catalog/filter page.

## Verification

Per ADR 0005 there are no tests. The gate is:

```bash
pnpm check:no-tests && pnpm check:module-cycles && pnpm check:frontend-structure \
  && pnpm --filter=@booking/storefront security \
  && pnpm turbo lint typecheck build
```

Then, manually:

1. `pnpm --filter=@booking/storefront build && pnpm --filter=@booking/storefront start`
2. `bookingstudio.localhost:5173/vi` — Chrome DevTools → Application → Manifest shows
   "BookingStudio", the tenant primary as theme color, and no icon errors; Service Workers shows
   `sw.js` activated.
3. Install the app; confirm the icon, the standalone launch at `/vi`, and that the bottom nav clears
   the home indicator.
4. DevTools → Network → Offline, reload → `/offline.html`. Re-enable, reload → the real page.
5. `localhost:5173` (platform landing) — manifest resolves to "BookingOS" and is not redirected.
6. `bookingstad.localhost:5173/vi` — a second tenant installs as a separate app with its own brand.
7. Sign in, then DevTools → Application → Cache Storage: confirm **no** HTML entry exists.
8. Home page at 390px: category tiles 3-across, full-width search button, 2-up top rail, row-layout
   recommended cards. At 1280px: identical to `main`.
9. `pnpm --filter=@booking/storefront dev` — confirm no service worker is registered.
