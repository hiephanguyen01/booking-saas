# Tenant Mobile-only PWA Install Promotion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Promote installation of each live, fully branded tenant PWA on eligible public mobile pages.

**Architecture:** Keep eligibility and install mechanics in the root shell/PWA provider, then reuse a private install trigger in standard and route-owned mobile headers. Make a qualifying favicon upload the single source for regular launcher variants while keeping maskable artwork optional.

**Tech Stack:** React 19, React Router 8, TypeScript, React Hook Form, Canvas, i18next, Tailwind CSS v4.

## Global Constraints

- Add no test files or test configuration per ADR 0005.
- Advertise only live tenants with complete PWA icons, on actual Android/iOS devices and eligible public routes.
- Never advertise on Platform, desktop, standalone, auth, checkout, bookings or account routes.
- Do not change APIs, database schema, manifest fallback, Service Worker, cache/offline behavior or update lifecycle.
- Add no dependency, migration, backend image processing or app-store link.

---

### Task 1: Make favicon upload produce the atomic PWA icon set

**Files:** Theme Settings fields/card and `pwa-icon-uploader.tsx`.

**Interfaces:** Preserve `ThemeConfigInput`; set `faviconUrl` plus `pwaIcons.icon180Url`, `icon192Url` and `icon512Url` only after all uploads succeed.

- [x] Replace the separate favicon field and main PWA upload with one custom section named “Favicon & icon ứng dụng”.
- [x] Register and watch only `faviconUrl` and `pwaIcons`; retain the existing square PNG/WebP ≥512 validation and parallel Canvas/upload pipeline.
- [x] Store the uploaded 512 PNG URL in both `faviconUrl` and `pwaIcons.icon512Url`; preserve an existing maskable URL when replacing the main icon.
- [x] Show legacy favicon preview and a re-upload explanation when `faviconUrl` exists without `pwaIcons`.
- [x] Clearing the main artwork clears `faviconUrl` and the complete `pwaIcons` object; maskable remains independently removable while a main set exists.
- [x] Run Dashboard lint/typecheck plus theme-token and no-tests gates.

### Task 2: Add direct tenant mobile promotion

**Files:** Storefront root shell, PWA provider, shared tenant header and route-owned mobile headers.

**Interfaces:** Keep `PwaContext` unchanged. Add private `installAppName?: string` to `PwaProvider`; install mode and `TenantInstallTrigger` remain internal.

- [x] Derive promotion eligibility from tenant kind/live state, complete PWA icons and exact public pathname classification.
- [x] Classify native prompt, iOS Safari, Android Chrome manual and external-browser guides after actual-mobile detection.
- [x] Replace visit counting/30-day local storage with a guarded once-per-tab-session bottom sheet.
- [x] Replace the mobile hamburger/avatar with brand + direct install CTA and Log in/Account fallback.
- [x] Add a compact reusable install chip to catalog and detail app bars without removing route actions.
- [x] Suppress a consumed native prompt while preserving standalone hiding and the standalone update banner.
- [x] Run Storefront and i18n lint/typecheck.

### Task 3: Align docs and verify production behavior

**Files:** PWA locale files and `docs/features/storefront-pwa.md`.

**Interfaces:** Preserve current translation keys where possible; add explicit generic fallback keys without changing exported TypeScript APIs.

- [x] Document tenant mobile-only eligibility, direct header CTA, session sheet, browser guides, unified icon upload and unchanged manifest/worker lifecycle.
- [x] Run `pnpm check:no-tests && pnpm check:module-cycles && pnpm check:frontend-structure && pnpm check:theme-tokens && pnpm --filter=@booking/storefront security`.
- [x] Run `pnpm turbo lint typecheck build && pnpm --filter=@booking/api check:rls` and require exit 0; Vite sourcemap warnings remain non-fatal.
- [x] Run `git diff --check` and confirm no manifest, worker, cache, API or database files changed.
- [x] Test the production build on Platform and tenant desktop/narrow viewport; verify the iOS/Android browser classifier with representative device user agents.
- [ ] Confirm the final native prompt and iOS Share sheet on a real mobile device; desktop browser automation cannot emit these operating-system surfaces.
