# Storefront PWA

The storefront is installable on both the BookingOS platform host and every tenant host. Installation
promotion is tenant-only: a live tenant advertises installation on its localized Home route, while
the platform, desktop header and non-Home tenant routes do not show install CTAs or banners.

## Tenant icon contract

`ThemeConfigInput` persists the favicon and PWA launcher variants separately, while Theme Settings
creates them from one qualifying source upload:

```ts
pwaIcons?: {
  icon180Url: string;
  icon192Url: string;
  icon512Url: string;
  maskable512Url?: string;
};
```

The object is optional for compatibility with existing `theme_config` JSON. Once present, all three
regular icon URLs are required.

Theme Settings accepts a square PNG/WebP of at least 512px. The browser Canvas creates PNG variants
at 180, 192 and 512px, then uploads all three concurrently through the existing same-origin presign
route and direct S3/MinIO PUT flow. The 512 URL is also stored as `faviconUrl`; the form changes only
after every upload succeeds. The optional 512px maskable icon is uploaded separately; its preview
overlays the Android safe zone and it is never synthesized from the main artwork. Legacy small or ICO
favicons remain tab-only until replaced with qualifying artwork.

StudioHub's seed points to 180/192/512 variants produced from its existing app icon. Tenants with
no complete `pwaIcons` object use the complete BookingOS fallback set for their manifest, touch icon
and Home install banner.

## Manifest brand selection

`/manifest.webmanifest` is host-aware and remains `private, no-store`. It makes one atomic choice:

- complete tenant `pwaIcons`: emit only the tenant 192/512 icons and its optional maskable icon;
- missing or invalid tenant set: emit only BookingOS 192/512/maskable icons.

The HTML `apple-touch-icon` follows the same choice, using tenant `icon180Url` or BookingOS
`/pwa/icon-180.png`. A manifest never mixes tenant and platform artwork.

## Release identity and cache boundary

`STOREFRONT_BUILD_ID` is an optional public build input. GitHub Deploy passes `github.sha` into the
storefront Docker build; Turbo includes the value in the build cache key; Vite injects it into the
client. A local build generates a timestamp-based identity when the variable is absent.

The client registers `/sw.js?v=<build-id>`. The worker derives
`bookingos-storefront-<build-id>` from its own URL and only deletes older caches beginning with
`bookingos-storefront-`. Caches owned by another application or tool are untouched.

The worker intercepts only same-origin `GET` requests:

| Request | Behaviour |
| --- | --- |
| navigation | network only; on failure return the worker's self-contained offline response; never cache either HTML response |
| `/assets/*`, `/pwa/*` | current-cache-first, then network and awaited `cache.put` for complete basic 200 responses |
| React Router data, auth, uploads, manifest and all other paths | browser handles the request; no Cache Storage write |
| cross-origin assets and non-GET requests | not intercepted |

Development registration actively unregisters service workers and removes only BookingOS storefront
caches, which prevents a production build checked on localhost from contaminating the next dev run.

## Update lifecycle

An updating worker does not call `skipWaiting()` during installation. It remains waiting while the
current page and any booking interaction continue on the existing release. The update banner is
visible only when the site runs in display-mode `standalone`. Selecting **Update** sends
`SKIP_WAITING`; the client reloads exactly once after `controllerchange`. Activating the new worker
claims clients and removes older BookingOS storefront cache versions.

## Install experience

- Only the tenant Home route advertises installation, using a tenant-branded floating banner above
  the bottom navigation. The mobile header does not render an install action, hamburger control or
  account avatar.
- On a supported mobile device, the banner appears on every actual Home route entry or full reload,
  even while a native install prompt is unavailable. Closing it affects only that Home entry; query,
  hash, revalidation and other navigation state changes that keep Home active do not show it again.
  No visit counter, session counter or persistent dismissal is stored.
- Chromium and other capable browsers use the captured `beforeinstallprompt` event directly from
  the banner action, without an intermediate custom dialog.
- iOS uses the same **Install now** action but opens the required browser Share → Add to Home Screen
  instructions because iOS does not expose a direct install prompt.
- Android uses the native prompt when available. If Chrome has not emitted it yet, the action opens
  Chrome menu instructions; alternate Android browsers are directed to open the page in Chrome.
- All install UI is hidden in standalone mode; platform, suspended-tenant and non-Home pages never
  promote installation.
- Unknown and non-mobile browsers without a direct install prompt do not show install UI. Service
  Worker, Canvas and install APIs are capability-checked or guarded; their absence cannot prevent
  normal storefront rendering or booking.
- Guest mobile headers keep the registration action. Signed-in customers use the persistent bottom
  navigation to reach their account. Desktop header behaviour is unchanged.

There is deliberately no push notification, background sync, offline booking/data store, Workbox,
image-processing backend, database migration or PWA test suite.

## Verification

Use the repository static-check command from `AGENTS.md`. For runtime checks, build and start the
storefront (the dev server intentionally removes workers), then inspect both the platform host and a
tenant host:

```bash
STOREFRONT_BUILD_ID=local-a pnpm --filter=@booking/storefront build
pnpm --filter=@booking/storefront start
```

Confirm manifest MIME/colors/icon ownership, worker URL/cache identity, offline navigation fallback,
the Home-only Chromium/iOS install flows, per-entry banner dismissal, non-Home and desktop exclusions,
and the user-confirmed A → B update lifecycle. Verify both `/vi` and `/en`, signed-in and guest mobile
headers, and the installed standalone experience.
