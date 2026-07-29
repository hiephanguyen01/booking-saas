# Simple Icons Brand Icon Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace every Lucide or approximate social brand glyph in the storefront footer with the corresponding Simple Icons glyph and package-provided brand color.

**Architecture:** `@booking/storefront` consumes `simple-icons` directly. The existing footer owns an exhaustive `SocialKey` to `SimpleIcon` mapping and renders a decorative SVG from each icon's `path` and `hex`, while Lucide remains responsible for non-brand interface icons.

**Tech Stack:** React 19, TypeScript, React Router 8 SSR, pnpm workspace, `simple-icons`

## Global Constraints

- Do not add automated tests or test configuration, per ADR 0005 and the repository hard rules.
- Preserve the existing social URLs, accessible link labels, focus behavior, spacing, and 24-pixel rendered size.
- Use the glyph path and `hex` value exported by `simple-icons`; do not duplicate SVG paths or brand colors locally.
- Limit application changes to the storefront dependency manifest, workspace lockfile, and footer component.
- Preserve all unrelated staged and unstaged user changes in the existing worktree.

---

### Task 1: Replace footer brand glyphs with Simple Icons

**Files:**
- Modify: `apps/storefront/package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `apps/storefront/app/features/site-shell/components/site-footer.tsx`

**Interfaces:**
- Consumes: `SocialKey` from `~/features/site-shell/lib/site-footer-fallback` and `SimpleIcon` metadata (`path`, `hex`) from `simple-icons`.
- Produces: `SocialIcon({ network }: { network: SocialKey })`, which renders the mapped official brand SVG while the parent link supplies its accessible name.

- [ ] **Step 1: Install the direct storefront dependency**

Run:

```bash
pnpm --filter=@booking/storefront add simple-icons
```

Expected: `simple-icons` appears under storefront `dependencies` and the workspace lockfile records the resolved version.

- [ ] **Step 2: Narrow Lucide imports to interface icons and import Simple Icons metadata**

Change the imports at the top of `site-footer.tsx` to the following shape:

```tsx
import { Mail, Phone } from 'lucide-react';
import {
  siFacebook,
  siInstagram,
  siTiktok,
  siYoutube,
  type SimpleIcon,
} from 'simple-icons';
```

Keep all unrelated imports unchanged.

- [ ] **Step 3: Render each official glyph with its package-provided color**

Replace the Lucide component mapping and renderer with:

```tsx
const SOCIAL_ICONS: Record<SocialKey, SimpleIcon> = {
  facebook: siFacebook,
  instagram: siInstagram,
  tiktok: siTiktok,
  youtube: siYoutube,
};

function SocialIcon({ network }: { network: SocialKey }) {
  const icon = SOCIAL_ICONS[network];

  return (
    <svg
      aria-hidden="true"
      className="size-6"
      fill={`#${icon.hex}`}
      viewBox="0 0 24 24"
    >
      <path d={icon.path} />
    </svg>
  );
}
```

Do not use `currentColor` for the fill: the requirement is the exact `hex` suggestion exported by Simple Icons.

- [ ] **Step 4: Confirm deprecated brand imports and copied brand colors are absent**

Run:

```bash
rg -n "Facebook|Instagram|Music2|Youtube|siFacebook|siInstagram|siTiktok|siYoutube|icon\.hex" apps/storefront/app/features/site-shell/components/site-footer.tsx
```

Expected: only the four `si*` imports/mapping entries and `icon.hex` remain for brand rendering; Lucide only supplies `Mail` and `Phone`.

- [ ] **Step 5: Run focused static verification**

Run:

```bash
pnpm --filter=@booking/storefront lint
pnpm --filter=@booking/storefront typecheck
pnpm --filter=@booking/storefront security
pnpm --filter=@booking/storefront build
pnpm check:no-tests
pnpm check:frontend-structure
```

Expected: every command exits with status 0. If a command fails in an unrelated dirty file, record the exact existing failure and separately verify the changed footer file where the command supports a file target.

- [ ] **Step 6: Review the final scoped diff**

Run:

```bash
git diff --check
git diff -- apps/storefront/package.json pnpm-lock.yaml apps/storefront/app/features/site-shell/components/site-footer.tsx
```

Expected: no whitespace errors and no changes outside the three implementation files from this task.
