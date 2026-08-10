# Tenant mobile-only PWA install promotion

## Goal

Promote each live tenant storefront as its own mobile PWA while keeping the BookingOS Platform free
of install advertising. Tenant copy and launcher artwork must stay white-label.

## User experience

- Install promotion appears only on actual Android or iOS/iPadOS devices. Responsive width does not
  qualify a desktop browser.
- The standard tenant mobile header is brand + direct install CTA, with no hamburger or avatar. When
  promotion is unavailable it shows a text Log in/Account fallback. Catalog and detail app bars add a
  compact install chip without removing their route actions.
- A dismissible bottom sheet opens once in every tab session. Chromium opens
  `beforeinstallprompt`; iOS Safari and Android Chrome without a native event show manual steps;
  unsupported/in-app browsers guide the customer to Safari or Chrome.
- Platform pages, suspended tenants, standalone mode, authentication, checkout, bookings and account
  routes never show install promotion. The standalone update banner remains unchanged.
- Tenant home, nearby, catalog, listing, listing-group, provider and community routes are eligible.
  URL fragments such as `#consultation` do not affect eligibility.

## Branding and icon eligibility

Promotion requires a complete tenant `pwaIcons` trio (180/192/512). Tenants with only a legacy
favicon remain manually installable with the existing atomic BookingOS manifest fallback, but are not
advertised until they upload qualifying artwork.

Theme Settings uses one main **Favicon & app icon** upload. A PNG/WebP source must be square and at
least 512×512. Canvas produces PNG 180/192/512 variants; the 512 URL is also stored as `faviconUrl`.
All uploads finish before the form changes. The optional maskable 512 upload remains separate.
Existing small/ICO favicons remain tab-only until replaced; no migration or backend image processing
is introduced.

## Architecture

`StorefrontAppShell` derives install eligibility from tenant kind, `tenant.live`, complete PWA icons
and the current public route. It passes the normalized tenant name to `PwaProvider`; empty names use
generic white-label copy. `PwaContext` remains `{ canInstall, install }`.

`PwaProvider` classifies native, iOS Safari, Android Chrome manual and external-browser guidance while
retaining standalone/update handling. It records sheet presentation in guarded `sessionStorage` and
suppresses a consumed native prompt for the remainder of the session. A private
`TenantInstallTrigger` reuses `{ canInstall, install }` in standard, catalog and detail headers;
Platform does not consume PWA install state.

Manifest brand selection, Service Worker registration, build-versioned caches, offline fallback and
explicit update activation do not change.

## Verification

No test files are added per ADR 0005. Run all architecture/security gates, lint, typecheck, build and
RLS checks. In the production build verify desktop Platform and narrowed desktop tenant stay hidden,
tenant mobile emulation exposes branded promotion only on eligible public routes, private/suspended
routes stay hidden, and native/manual/browser-guide, session dismissal and standalone update flows
remain intact.
