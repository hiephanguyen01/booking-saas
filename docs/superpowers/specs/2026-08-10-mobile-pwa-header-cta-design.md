# Mobile PWA Header CTA Design

## Goal

Restore the tenant Home mobile header install control to the explicit filled CTA shown in the
reference image. The control must be easier to recognize than the current icon-only button without
changing any PWA eligibility or installation behavior.

## Approved design

- Replace only the Home mobile header's icon-only Download button with a compact filled primary
  button.
- Keep the existing Download icon and add a localized text label:
  - Vietnamese: **Cài app**
  - English: **Install app**
- Match the reference geometry: approximately 40px tall, 8px corner radius, compact horizontal
  padding, and a clear icon-to-label gap.
- Use the tenant primary button styling already provided by the shared `Button` component so the CTA
  remains consistent with the storefront brand.
- Keep the current registration or account action in the header. The install CTA is a separate
  sibling and does not replace it during hydration.

## Scope and behavior

The change is presentation-only inside `SiteHeaderMobileMenu`. Visibility remains driven by the
existing `PwaContext.canInstall`, so the CTA appears only on tenant Home mobile when installation is
available and the app is not running standalone.

Click behavior remains unchanged:

- browsers exposing `beforeinstallprompt` open the native installation prompt directly;
- iPhone and iPad open the required Share → Add to Home Screen guide;
- unsupported non-iOS browsers do not show the CTA.

The floating install banner, its **Cài ngay** / **Install now** action, desktop header, hamburger menu,
service-worker update banner, routes, backend, API, and data contracts are unchanged.

## Verification

No automated tests are added under the repository's no-tests policy. Verify with Storefront lint,
typecheck, production build, and a mobile runtime check for `/vi` and `/en`. Confirm the localized
label, filled primary styling, preserved account/registration action, direct Android install flow,
iOS guide, and absence on non-Home, desktop, and standalone surfaces.
