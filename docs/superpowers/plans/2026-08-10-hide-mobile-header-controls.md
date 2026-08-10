# Hide Mobile Header Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the signed-in avatar and hamburger sheet from every tenant storefront mobile header while preserving guest registration, Home PWA installation, bottom navigation, and desktop navigation.

**Architecture:** Reduce the mobile header to a focused responsive row containing the tenant brand and eligible actions. Delete the sheet-only controller and remove the now-dead `hideMobileMenuTrigger` route plumbing from the route handle through the root shell; desktop account/navigation components remain untouched.

**Tech Stack:** React 19, React Router 8 framework mode, TypeScript 5.9, Tailwind CSS v4, shadcn Button, `@booking/i18n`.

## Global Constraints

- Do not add automated tests, test files, test configuration, or test scripts; repository verification is static checks plus running the app.
- Apply the change to every tenant storefront route below the `lg` breakpoint.
- Keep the tenant brand, guest registration action, and eligible Home-only PWA install action.
- Preserve desktop navigation and the desktop account menu without visual or behavioral changes.
- Do not change loaders, authentication, backend APIs, data, dependencies, or bottom-navigation behavior.
- Preserve all unrelated staged and unstaged working-tree changes.
- Do not stage or commit implementation changes unless the user explicitly requests it.

---

### Task 1: Replace the mobile menu sheet with a minimal header row

**Files:**

- Rename: `apps/storefront/app/features/site-shell/components/site-header-mobile-menu.tsx` → `apps/storefront/app/features/site-shell/components/site-header-mobile.tsx`
- Modify: `apps/storefront/app/features/site-shell/components/site-header.tsx`
- Modify: `apps/storefront/app/features/account/components/account-flow/account-flow-layout.tsx`
- Delete: `apps/storefront/app/features/site-shell/hooks/use-site-header-mobile-menu-controller.ts`
- Modify: `apps/storefront/app/features/site-shell/lib/site-header-handle.ts`
- Modify: `apps/storefront/app/features/root/hooks/use-storefront-app-shell-controller.ts`
- Modify: `apps/storefront/app/features/root/components/storefront-app-shell.tsx`
- Modify: `apps/storefront/app/features/site-shell/components/site-bottom-nav.tsx`
- Modify: `docs/features/storefront-pwa.md`

**Interfaces:**

- Consumes: `usePwa(): { canInstall: boolean; install(): Promise<void> }`, `brand: ReactNode`, and optional `actions: ReactNode`.
- Produces: `SiteHeaderMobile({ brand, actions }: { brand: ReactNode; actions?: ReactNode })`, rendered only below `lg`.
- Removes: `SiteHeaderMobileMenu`, `useSiteHeaderMobileMenuController`, `SiteHeaderRouteHandle.hideMobileMenuTrigger`, the corresponding root-shell and `SiteHeader` props, and the mobile-menu-only `listingTypes` input from `SiteHeader`.

- [ ] **Step 1: Rename and reduce the mobile header component**

Rename the component file, remove every Sheet/navigation/account/controller import and helper, and retain only the responsive row:

```tsx
import { NsI18n, useTranslation } from '@booking/i18n';
import { Button } from '@booking/ui/components/ui/button';
import { Download } from 'lucide-react';
import type { ReactNode } from 'react';
import { usePwa } from '~/features/pwa/lib/pwa-context';

export function SiteHeaderMobile({
  brand,
  actions,
}: {
  brand: ReactNode;
  actions?: ReactNode;
}) {
  const { t: tPwa } = useTranslation(NsI18n.Pwa);
  const { canInstall, install } = usePwa();

  return (
    <div className="flex h-18 items-center justify-between gap-1 min-[400px]:gap-2 lg:hidden">
      <div className="min-w-0 flex-1 overflow-hidden [&_img]:max-w-full [&_span]:block [&_span]:max-w-full">
        {brand}
      </div>
      <div className="flex shrink-0 items-center gap-1 min-[400px]:gap-2">
        {actions ? (
          <div className="shrink-0 max-[359px]:[&>a]:px-2 max-[359px]:[&>button]:px-2">
            {actions}
          </div>
        ) : null}
        {canInstall ? (
          <Button
            type="button"
            className="h-10 shrink-0 rounded-lg px-2.5 text-xs font-semibold min-[400px]:px-3.5 min-[400px]:text-sm"
            onClick={() => void install()}
          >
            <Download className="size-5" aria-hidden="true" />
            {tPwa('install.headerAction')}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
```

The resulting file must contain no `Sheet`, hamburger `Menu`, avatar, account links, locale form, logout form, listing-type links, or mobile navigation helpers.

- [ ] **Step 2: Stop supplying a signed-in mobile account action**

In `site-header.tsx`, import `SiteHeaderMobile` from `./site-header-mobile`; remove the
`hideMobileMenuTrigger` and `listingTypes` props plus the now-unused
`PublicListingTypeResponse` import; then render the mobile row with only `brand` and guest-only
registration:

```tsx
<SiteHeaderMobile
  brand={<BrandHomeLink locale={locale} tenant={tenant} />}
  actions={
    currentUser ? undefined : (
      <Button asChild className="h-9.5 rounded-md px-4 text-xs font-bold">
        <Link to={storefrontPaths.register(locale)} prefetch="intent">
          {t('register')}
        </Link>
      </Button>
    )
  }
/>
```

Do not modify the desktop `<nav>` branch or `SiteHeaderAccountMenu` usage inside it.

- [ ] **Step 3: Delete dead hamburger state and route plumbing**

Delete `use-site-header-mobile-menu-controller.ts`. Remove `hideMobileMenuTrigger` from:

- `SiteHeaderRouteHandle` and `HOME_HEADER_HANDLE` in `site-header-handle.ts`.
- The `matches.some(...)` calculation and returned controller object in `use-storefront-app-shell-controller.ts`.
- The controller destructuring and `SiteHeader` prop in `storefront-app-shell.tsx`.
- The `SiteHeader` public props in `site-header.tsx`.

Also stop passing `listingTypes` into `SiteHeader` from `storefront-app-shell.tsx` and
`account-flow-layout.tsx`. Keep `listingTypes` in the root-shell controller and account context;
continue using it for `SiteBottomNav` and `CategoryNav`. Only the header prop is dead.

After these edits, this search must return no code matches:

```bash
rg -n "hideMobileMenuTrigger|useSiteHeaderMobileMenuController|SiteHeaderMobileMenu" apps/storefront/app
```

Expected: no output and exit code `1`.

- [ ] **Step 4: Align documentation comments with the new navigation model**

Update the comment above `SiteBottomNav` to describe it as the primary mobile navigation and remove statements that the hamburger sheet remains. Update the PWA install experience documentation to state that the mobile header does not render a hamburger control, while the install CTA remains Home-only.

- [ ] **Step 5: Format and inspect the focused diff**

Run:

```bash
pnpm exec prettier --write \
  apps/storefront/app/features/site-shell/components/site-header-mobile.tsx \
  apps/storefront/app/features/site-shell/components/site-header.tsx \
  apps/storefront/app/features/account/components/account-flow/account-flow-layout.tsx \
  apps/storefront/app/features/site-shell/lib/site-header-handle.ts \
  apps/storefront/app/features/root/hooks/use-storefront-app-shell-controller.ts \
  apps/storefront/app/features/root/components/storefront-app-shell.tsx \
  apps/storefront/app/features/site-shell/components/site-bottom-nav.tsx \
  docs/features/storefront-pwa.md
git diff --check
```

Expected: Prettier completes and `git diff --check` prints no errors. Inspect the diff to confirm the desktop `<nav>`, bottom-navigation behavior, PWA install callback, and guest registration URL are unchanged.

---

### Task 2: Verify responsive behavior and production compatibility

**Files:**

- Verify only; do not create test files.

**Interfaces:**

- Consumes: the simplified `SiteHeaderMobile` and existing route/root shell.
- Produces: evidence that the mobile controls are absent and existing storefront gates remain green.

- [ ] **Step 1: Run repository policy and frontend gates**

Run each command from the repository root:

```bash
pnpm check:no-tests
pnpm check:frontend-structure
pnpm --filter=@booking/storefront security
pnpm --filter=@booking/storefront lint
pnpm --filter=@booking/storefront typecheck
pnpm --filter=@booking/storefront build
```

Expected: every command exits `0`. Existing Vite sourcemap-location warnings may appear during build, but both client and SSR builds must finish successfully.

- [ ] **Step 2: Inspect the production build at mobile widths**

Run the already-built storefront locally and inspect tenant routes at 320px and 390px widths:

```bash
PORT=5173 NODE_ENV=development pnpm --filter=@booking/storefront start
```

Verify:

- Signed-in Home and non-Home routes show neither the avatar nor hamburger.
- Guest routes retain the registration action.
- The tenant brand does not overflow at 320px.
- The Home install CTA still appears only when the browser exposes an eligible install flow or is iOS.
- Mobile account destinations remain reachable from the existing bottom-navigation account tab.
- At `lg` and wider, desktop navigation and the signed-in account menu are unchanged.
- `/vi` and `/en` render the correct retained actions.

- [ ] **Step 3: Report the handoff without staging implementation files**

Report the changed files, static-check results, production URL, and the physical-device limitation for native PWA installation. Leave all implementation files unstaged/uncommitted unless the user gives a separate git instruction.
