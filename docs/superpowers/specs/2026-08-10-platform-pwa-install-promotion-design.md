# Platform-only PWA install promotion

## Goal

Promote installation of the BookingOS PWA from the BookingOS platform landing page, not from tenant
storefronts. Tenant manifests remain white-label and installable through browser-native controls, but
BookingOS-owned install CTAs and banners must not appear on tenant hosts.

## User experience

- The Platform header shows **Install BookingOS** only when the current browser can install the PWA.
  The action is available in the desktop header and the mobile navigation menu.
- Chromium opens the captured native install prompt. iOS opens the existing Share → Add to Home
  Screen guide.
- The existing install banner is enabled on Platform and starts from the second browser session. A
  dismissal remains effective for 30 days.
- All install promotion is hidden when running in standalone mode.
- Tenant storefronts show no install menu item or install banner.
- Platform pages without install capability render normally without an empty or disabled CTA.

## Architecture and data flow

`StorefrontAppShell` sets `PwaProvider.advertiseInstall` only for a platform loader payload. The
provider continues to own capability detection, session counting, dismissal state, Chromium prompt
capture, iOS guidance and standalone detection.

`PlatformHeader` consumes `usePwa()` and renders an install button only when `canInstall` is true. It
reuses the `pwa` translation namespace rather than duplicating install strings in the Platform
namespace. The tenant `SiteHeaderMobileMenu` no longer renders an install action.

No API, storage endpoint, database schema or server-side session changes are required. The install
state remains browser-local under the existing PWA storage keys.

## Manifest, worker and update boundaries

- Platform `/manifest.webmanifest` continues to use the complete BookingOS icon set.
- Tenant manifests continue to atomically choose tenant icons or the complete BookingOS fallback.
- Tenant PWA installability is retained; only BookingOS-owned promotion is removed.
- Service Worker registration, release-versioned caches and offline behavior do not change.
- The update banner remains available to any standalone installation, including a tenant app that
  was installed manually or before this change. `advertiseInstall` gates installation UI only.

## Failure handling

Missing Service Worker, install APIs, storage or Canvas support must not block Platform or tenant
rendering. An expired or rejected native prompt is handled by the existing guarded install action.
The Platform CTA disappears when no valid install prompt or iOS instruction flow is available.

## Verification

No test files are added, per ADR 0005. Verification consists of the repository static gates plus
manual runtime checks:

1. Platform shows the header/mobile install action when supported; tenant hosts never show it.
2. Platform install banner appears from the second session and remains dismissed for 30 days.
3. Chromium and iOS actions use their existing native/instruction flows.
4. Standalone mode hides install UI while preserving the standalone-only update banner.
5. Platform and tenant manifests retain their existing brand-selection behavior.
6. Offline, cache versioning and explicit worker update activation remain unchanged.

