# Hide Mobile Header Account Controls

## Goal

Simplify the tenant storefront header on every mobile route by removing the account avatar and
hamburger trigger. Mobile users continue to reach account and navigation destinations through the
existing bottom navigation. Desktop navigation remains unchanged.

## Scope

- Applies to every tenant storefront route below the `lg` breakpoint.
- Do not render the signed-in account avatar in the mobile header.
- Do not render the hamburger trigger or its mobile sheet in the mobile header.
- Keep the tenant brand visible.
- Keep the guest registration action visible.
- Keep the Home-only PWA install button and its current install behavior visible when eligible.
- Preserve the desktop account menu and desktop navigation without visual or behavioral changes.
- Do not change route loaders, authentication, backend APIs, data, or the bottom navigation.

## Component design

`SiteHeader` will stop passing the signed-in account menu as a mobile header action. It will still
pass the existing registration action for guests.

`SiteHeaderMobileMenu` will become the mobile header row rather than a sheet owner: it will retain
the brand, optional guest action, and eligible PWA install CTA, while removing the `Sheet` trigger,
content, and controller state that only served the hamburger menu. Its public inputs will be reduced
to the values still required by those remaining controls.

This removes inaccessible hidden controls from the DOM instead of applying presentation-only CSS.

## Responsive behavior

- Signed-in, non-Home mobile: tenant brand only.
- Signed-in Home mobile with install eligibility: tenant brand and install CTA.
- Guest, non-Home mobile: tenant brand and registration CTA.
- Guest Home mobile with install eligibility: tenant brand, registration CTA, and install CTA.
- Desktop: no change.

The existing compact spacing and flexible brand region remain in place for narrow phones.

## Verification

Repository policy forbids automated tests. Verify with formatting, no-tests policy, frontend
structure, Storefront security, lint, typecheck, production build, and manual responsive inspection
of signed-in and guest pages on Home and non-Home routes.
