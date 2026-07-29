# BookingOS Landing HTML Match Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the production BookingOS platform landing closely match the attached bundled HTML while preserving its React Router, localization, login, and consultation behavior.

**Architecture:** Keep the existing platform-only component boundary and translation contract. Recompose the current JSX with the reference layout, centralize visual tokens and shared controls in `app.css`, and continue using real BookingStudio and BookingStad assets instead of prototype media blocks.

**Tech Stack:** React Router 8 SSR, React 19, TypeScript, Tailwind CSS v4 utilities, shared CSS in `app.css`, Lucide React, `@booking/i18n`.

## Global Constraints

- Follow the attached `/Users/hiephanguyen01/Downloads/BookingOS Landing.html` as the visual source of truth.
- Preserve Vietnamese and English translations, the loader-provided dashboard login URL, form validation, and submission states.
- Do not change routes, SEO behavior, API contracts, tenant storefront templates, or form field names.
- Use `#F4F5F7` for the page surface, `#0A0E13` for ink, and `#FFB020` for the accent.
- Use Plus Jakarta Sans, a 72px sticky header, and a 1200px maximum content width.
- Keep all animations compatible with `prefers-reduced-motion`.
- Add no dependencies.
- Do not add tests or test configuration. Verification is static checks, builds, and running-app inspection per repository policy.

---

### Task 1: Establish the reference design foundation and header

**Files:**
- Modify: `apps/storefront/app/app.css:56-383`
- Modify: `apps/storefront/app/features/platform-landing/components/platform-landing.tsx:20-41`
- Modify: `apps/storefront/app/features/platform-landing/components/platform-header.tsx:1-143`

**Interfaces:**
- Consumes: `PlatformRootLoaderPayload.locale`, `PlatformRootLoaderPayload.dashboardLoginUrl`, and the existing `platform.*` translation keys.
- Produces: reusable `.platform-*` tokens and control classes used by every later task, plus unchanged `PlatformHeader` and `PlatformBrand` exports.

- [ ] **Step 1: Replace the platform color and layout foundation**

Set the page root to the reference surface and define the shared measurements in `app.css`:

```css
.platform-landing {
  --platform-surface: #f4f5f7;
  --platform-panel: #ffffff;
  --platform-ink: #0a0e13;
  --platform-muted: #4a515b;
  --platform-line: #e4e6ea;
  --platform-accent: #ffb020;
  --platform-accent-hover: #e89a00;
  --platform-max-width: 75rem;
  min-height: 100dvh;
  background: var(--platform-surface);
  color: var(--platform-ink);
  font-family: 'Plus Jakarta Sans', ui-sans-serif, system-ui, sans-serif;
}
```

Remove the current decorative hero grid and warm cream surfaces. Keep shared button, form, focus, FAQ, and reveal selectors but recalibrate their borders, backgrounds, radii, shadows, and motion to the reference.

- [ ] **Step 2: Align the page shell and skip link**

Update `PlatformLanding` to use the CSS-owned platform surface without hard-coded warm colors. Keep the existing section order and `platform-main` landmark.

```tsx
<div className="platform-landing overflow-x-clip selection:bg-[#ffb020] selection:text-[#0a0e13]">
  <a href="#platform-main" className="platform-skip-link">
    {t('skipToContent')}
  </a>
  <PlatformHeader locale={loaderData.locale} dashboardLoginUrl={loaderData.dashboardLoginUrl} />
  <main id="platform-main">...</main>
</div>
```

- [ ] **Step 3: Match the 72px reference header**

Keep `NAV_ITEMS`, locale switching, login URL, menu state, Escape handling, and focus restoration. Change only visual structure and breakpoints: 1200px content width, 24px horizontal desktop padding, 72px height, `rgba(244,245,247,.86)` backdrop, `#E4E6EA` divider, desktop navigation from `md`, and a 44px square dark mobile menu button.

Use the reference brand mark: 30px dark rounded square, 12px amber inner square, and 19px/800 wordmark. Keep the consultation label identical across header, hero, pricing, form, and footer.

- [ ] **Step 4: Verify the foundation**

Run:

```bash
pnpm --filter=@booking/storefront lint
pnpm --filter=@booking/storefront typecheck
```

Expected: both commands exit successfully with no new warnings or errors.

- [ ] **Step 5: Commit the foundation**

```bash
git add apps/storefront/app/app.css apps/storefront/app/features/platform-landing/components/platform-landing.tsx apps/storefront/app/features/platform-landing/components/platform-header.tsx
git commit -m "feat(storefront): align landing shell with reference"
```

### Task 2: Match the hero, service models, and transformation sections

**Files:**
- Modify: `apps/storefront/app/features/platform-landing/components/platform-sections.tsx:1-269`
- Modify: `apps/storefront/app/app.css`
- Modify: `packages/i18n/src/locales/vi/platform.ts:20-79`
- Modify: `packages/i18n/src/locales/en/platform.ts:20-79`

**Interfaces:**
- Consumes: the shared controls and tokens from Task 1, `NsI18n.Platform`, and current project image URLs.
- Produces: unchanged `PlatformHero`, `ServiceModelsSection`, and `TransformationSection` exports.

- [ ] **Step 1: Recompose the reference hero**

Use a 1200px two-column grid with `1.15fr / .95fr`, 56px gap, 64px top padding, and 72px bottom padding. Set the headline to `clamp(38px,5vw,60px)`, `1.04` line height, `-.03em` tracking, and `14ch` maximum width. Keep the current Vietnamese and English headline and description.

Use `/booking-studio/hero.png` as the 4:3 main media. Keep `SchedulePreview` as the real overlapping operations visual, but size and place it like the reference's smaller 16:11 card (`left:-42px`, `bottom:-38px`, `width:56%`) on desktop and return it to normal flow on mobile. Remove the current image caption because the prototype hero has only headline, description, calls to action, and media.

- [ ] **Step 2: Match service model composition**

Set the section id to `models` and update header links to target it. Use the reference two-column `0.85fr / 1.15fr` layout and a two-column white tile matrix inside one 18px clipped border. Render six current translation labels and icons with 42px amber-soft icon wells.

- [ ] **Step 3: Match the before-and-after block**

Use the reference centered heading and paired panels. Retain `BEFORE_ITEMS`, `AFTER_ITEMS`, and semantic list markup. Replace the current wide amber separator with the reference's directional transition treatment, using `ArrowDownRight` and the shared accent without introducing another palette.

- [ ] **Step 4: Align wording with the attached Vietnamese reference**

Keep the translation shape identical. Update only strings that visibly diverge from the attached headings, including the capability section title later consumed by Task 3:

```ts
models: {
  title: 'Một nền tảng, nhiều mô hình dịch vụ.',
  description:
    'Bất kỳ doanh nghiệp nào có tài nguyên, lịch hoặc công suất cần đặt trước đều có thể vận hành trên BookingOS.',
},
capabilities: {
  title: 'Bốn năng lực làm nên một hệ vận hành.',
}
```

Apply equivalent natural English wording without changing keys.

- [ ] **Step 5: Verify and commit the first section group**

Run:

```bash
pnpm --filter=@booking/storefront lint
pnpm --filter=@booking/storefront typecheck
```

Expected: both commands exit successfully.

Then commit:

```bash
git add apps/storefront/app/features/platform-landing/components/platform-sections.tsx apps/storefront/app/app.css packages/i18n/src/locales/vi/platform.ts packages/i18n/src/locales/en/platform.ts
git commit -m "feat(storefront): match landing hero and opening sections"
```

### Task 3: Match the product story, demos, pricing, trust, FAQ, form, and footer

**Files:**
- Modify: `apps/storefront/app/features/platform-landing/components/platform-sections.tsx:271-719`
- Modify: `apps/storefront/app/features/platform-landing/components/platform-consultation-form.tsx:72-247`
- Modify: `apps/storefront/app/app.css`
- Modify: `packages/i18n/src/locales/vi/platform.ts:80-302`
- Modify: `packages/i18n/src/locales/en/platform.ts:80-302`

**Interfaces:**
- Consumes: `PlatformConsultationForm`, `PlatformRootLoaderPayload`, `PlatformBrand`, the shared styles from Task 1, and media already present under `apps/storefront/public`.
- Produces: all existing section exports with unchanged names and props; form field names remain `name`, `phone`, `business`, and `service`.

- [ ] **Step 1: Rebuild the four capability compositions**

Set the anchor to `capabilities` and update header/footer links. Replace the current sticky stack with the reference rhythm:

- Storefront: copy left, real BookingStudio media right.
- Scheduling: media treatment left, copy right.
- Partners: wide media-first row.
- Finance: copy left, ledger-oriented visual treatment right.

Use white panels on `#F4F5F7`, 20px radii, `#E4E6EA` borders, real project images where available, and existing icons for non-photographic details. Preserve the four descriptions and detail statements.

- [ ] **Step 2: Match workflow and demo sections**

Keep the workflow's three translated stages, but use the reference's simple horizontal progression with sparse dividers and amber sequence markers. Collapse to one column below 768px.

Render BookingStudio and BookingStad as the reference's two large side-by-side demo cards. Use the existing image URLs and keep alt text from translations. Preserve each demo's real destination URL behavior already encoded in the component.

- [ ] **Step 3: Match pricing and trust treatments**

Keep pricing honest: retain the consultation-first state and do not introduce numeric plan claims. Style it like the attached pricing section with a strong dark content panel, amber action, and the same 1200px section alignment.

Render the five trust statements in the reference's dark section using existing semantic icons and a responsive grid. All text and icons must meet contrast requirements against `#0A0E13`.

- [ ] **Step 4: Match FAQ, consultation, and footer**

Keep native `details`/`summary` behavior for FAQ and preserve `ChevronDown` state styling. Use the reference's single-column accordion width, thin dividers, and restrained spacing.

Use a two-column consultation block: conversion copy on the left and the real form on a white panel to the right. Restyle `.platform-form-control`, error messages, submission button, and status messages while preserving all validation and ARIA associations.

Match the reference footer hierarchy and neutral palette. Keep the dashboard URL, locale paths, legal fallback behavior, and all current navigation destinations.

- [ ] **Step 5: Audit visible copy and responsive collapse**

Read all Vietnamese and English strings rendered by the landing. Ensure header labels fit on one desktop line, primary calls to action share one label per intent, headings match the attached reference, and no prototype-only captions are visible. Check every multi-column section has an explicit mobile layout below 768px.

- [ ] **Step 6: Verify and commit the remaining sections**

Run:

```bash
pnpm --filter=@booking/storefront lint
pnpm --filter=@booking/storefront typecheck
pnpm --filter=@booking/storefront security
```

Expected: all commands exit successfully.

Then commit:

```bash
git add apps/storefront/app/features/platform-landing/components/platform-sections.tsx apps/storefront/app/features/platform-landing/components/platform-consultation-form.tsx apps/storefront/app/app.css packages/i18n/src/locales/vi/platform.ts packages/i18n/src/locales/en/platform.ts
git commit -m "feat(storefront): match landing sections with reference"
```

### Task 4: Production verification and visual fidelity audit

**Files:**
- Modify only files from Tasks 1-3 when the checks expose a concrete issue.

**Interfaces:**
- Consumes: the completed platform landing and existing storefront scripts.
- Produces: a buildable, responsive, visually inspected implementation with no new public API.

- [ ] **Step 1: Run repository policy and storefront checks**

Run:

```bash
pnpm check:no-tests
pnpm --filter=@booking/storefront lint
pnpm --filter=@booking/storefront typecheck
pnpm --filter=@booking/storefront security
pnpm --filter=@booking/storefront build
```

Expected: every command exits successfully.

- [ ] **Step 2: Run the storefront for visual inspection**

Start the app with the repository's configured environment:

```bash
pnpm --filter=@booking/storefront dev
```

Inspect the platform landing on the configured BookingOS base domain in Vietnamese and English at
1440x900, 1024x768, 768x1024, and 390x844. Compare header height, 1200px content alignment, hero
proportions, surface colors, section spacing, radii, shadows, and mobile stacking against the
attached HTML.

- [ ] **Step 3: Exercise interactions manually**

Confirm:

- Desktop and mobile navigation reach `#capabilities`, `#models`, `#workflow`, `#pricing`, and `#faq`.
- Escape closes the mobile menu and returns focus to the trigger.
- Both hero actions reach demos and consultation.
- FAQ disclosures open and close with keyboard input.
- Invalid consultation submission focuses the first invalid field and exposes the associated message.
- The loader-provided dashboard login URL remains intact.
- Reduced-motion mode removes entry movement.

- [ ] **Step 4: Review the final diff**

Run:

```bash
git diff --check
git status --short
git diff --stat
```

Expected: no whitespace errors and only planned landing, locale, CSS, spec, and plan files are changed.

- [ ] **Step 5: Commit verification fixes if needed**

If Step 2 or Step 3 required changes, commit only those verified fixes:

```bash
git add apps/storefront/app/features/platform-landing apps/storefront/app/app.css packages/i18n/src/locales/vi/platform.ts packages/i18n/src/locales/en/platform.ts
git commit -m "fix(storefront): refine landing reference fidelity"
```
