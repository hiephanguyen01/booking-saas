# Mobile PWA Header CTA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the tenant Home mobile PWA install control as a filled Download CTA labeled “Cài app” in Vietnamese and “Install app” in English.

**Architecture:** Keep the existing route and PWA capability gates unchanged. Add a header-specific localized label and change only the mobile header button presentation; the shared `install()` callback continues to choose the native browser prompt or iOS guide.

**Tech Stack:** React 19, React Router 8, TypeScript, Tailwind CSS v4, shadcn `Button`, `@booking/i18n`, Lucide React.

## Global Constraints

- Do not add, remove, or upgrade dependencies.
- Do not change PWA eligibility, route scoping, standalone detection, banner behavior, backend, API, schema, URL, or booking data.
- Keep the registration or account action visible as a separate header control.
- Vietnamese header label is exactly `Cài app`; English header label is exactly `Install app`.
- The floating banner keeps `Cài ngay` / `Install now`.
- Follow the repository no-tests policy: do not add test files, test scripts, test configuration, or CI test steps.
- Preserve unrelated and previously existing working-tree changes. Do not stage or commit implementation changes unless the user explicitly requests it.

---

### Task 1: Restore the labeled mobile header install CTA

**Files:**
- Modify: `packages/i18n/src/locales/vi/pwa.ts`
- Modify: `packages/i18n/src/locales/en/pwa.ts`
- Modify: `apps/storefront/app/features/site-shell/components/site-header-mobile-menu.tsx`

**Interfaces:**
- Consumes: `PwaContextValue.canInstall: boolean` and `PwaContextValue.install: () => Promise<void>` from `~/features/pwa/lib/pwa-context`.
- Produces: `pwa:install.headerAction` in both locale dictionaries and a filled Home mobile header CTA that calls the existing `install()` function.

- [ ] **Step 1: Add the header-specific localized copy**

In `packages/i18n/src/locales/vi/pwa.ts`, keep the banner action unchanged and add:

```ts
install: {
  title: 'Cài ứng dụng của cửa hàng',
  description: 'Mở nhanh từ màn hình chính và dùng trang dự phòng khi mất mạng.',
  headerAction: 'Cài app',
  action: 'Cài ngay',
  dismiss: 'Đóng lời mời cài đặt',
},
```

In `packages/i18n/src/locales/en/pwa.ts`, add the matching English property:

```ts
install: {
  title: 'Install this store app',
  description: 'Launch from your home screen and see a fallback page when offline.',
  headerAction: 'Install app',
  action: 'Install now',
  dismiss: 'Close the install invitation',
},
```

- [ ] **Step 2: Replace the icon-only header control with the approved CTA**

In `site-header-mobile-menu.tsx`, replace only the `canInstall` button block with:

```tsx
{canInstall ? (
  <Button
    type="button"
    className="h-10 shrink-0 rounded-lg px-3.5 text-sm font-semibold"
    onClick={() => void install()}
  >
    <Download className="size-5" aria-hidden="true" />
    {tPwa('install.headerAction')}
  </Button>
) : null}
```

Do not change the adjacent registration/account action, Sheet trigger, `canInstall` condition, or `install()` callback.

- [ ] **Step 3: Format the three modified implementation files**

Run:

```bash
pnpm exec prettier --write \
  apps/storefront/app/features/site-shell/components/site-header-mobile-menu.tsx \
  packages/i18n/src/locales/vi/pwa.ts \
  packages/i18n/src/locales/en/pwa.ts
git diff --check
```

Expected: Prettier completes and `git diff --check` exits with code 0.

- [ ] **Step 4: Run repository and Storefront static gates**

Run:

```bash
pnpm check:no-tests
pnpm check:frontend-structure
pnpm --filter=@booking/storefront security
pnpm --filter=@booking/storefront lint
pnpm --filter=@booking/i18n build
pnpm --filter=@booking/storefront typecheck
pnpm --filter=@booking/storefront build
```

Expected: every command exits with code 0. Building `@booking/i18n` refreshes the declaration files
consumed by the Storefront's typed translation keys. Existing Vite sourcemap-location warnings may
be printed during a successful build but must not produce a non-zero exit.

- [ ] **Step 5: Verify the responsive runtime behavior**

Run the existing local API and Storefront, then inspect tenant Home at mobile width:

```bash
pnpm --filter=@booking/api dev
pnpm --filter=@booking/storefront dev
```

Confirm:

- `/vi` renders a filled primary Download CTA labeled **Cài app** when `canInstall` is true.
- `/en` renders the same CTA labeled **Install app**.
- The button is approximately 40px tall with an 8px radius and does not replace the registration or account action.
- Clicking uses the native install prompt where available and the existing guide on iOS.
- The header CTA remains absent outside Home, on desktop, in standalone mode, and in unsupported non-iOS browsers.
- The floating banner still uses **Cài ngay** / **Install now**.

Use an install-capable Android browser and iPhone Safari for the final native-flow check because the development browser may not emit `beforeinstallprompt`.
