# Desktop Room Details Summary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show four useful room attributes before “View details” in desktop listing-group table rows while preserving the existing expanded content and responsive card behavior.

**Architecture:** Reuse the existing `RoomCompactSpecs` renderer and the existing `collapsedSummary` contract on `OfferingDetailsDisclosure`. The desktop `RoomDetails` call will provide the same summary as compact cards; the disclosure continues to own the collapsed-to-expanded transition and prevents duplicate content while open.

**Tech Stack:** React 19, React Router 8, TypeScript, Tailwind CSS 4, pnpm, Vite.

## Global Constraints

- Do not add automated tests or test configuration; ADR 0005 requires runtime verification plus static checks.
- Do not change API data, contracts, loaders, i18n copy, pricing, booking, mobile, or tablet behavior.
- Preserve all existing user changes in the dirty worktree.
- Display at most four compact attribute cards before the disclosure.
- Rooms without attribute cards retain the existing description-only or pending-information behavior.

---

### Task 1: Reuse the compact attribute summary in desktop room rows

**Files:**
- Modify: `apps/storefront/app/features/listing-group/components/room-cells.tsx:39-76`
- Modify: `apps/storefront/app/features/listing-group/components/room-options-section.tsx:238-245`

**Interfaces:**
- Consumes: `OfferingDetailsDisclosure({ cards, description, emptyLabel, collapsedSummary })` and `RoomCompactSpecs({ cards })`.
- Produces: `RoomDetails` collapsed state that renders `RoomCompactSpecs` whenever `cards.length > 0`, on desktop table rows and compact responsive cards.

- [x] **Step 1: Capture the failing desktop behavior in the running storefront**

At `http://studiohub.localhost:5173/vi/g/seed-studio-group-03` with a 1280×900 viewport, inspect the first room row before changing code.

Expected current failure:

```text
Room heading and photos are visible.
The next visible control is “Xem chi tiết”.
No area, style, ceiling-height, or equipment summary is visible while collapsed.
```

- [x] **Step 2: Pass the compact summary whenever attributes exist**

Update the disclosure call in `RoomDetails` to remove the `compact` condition:

```tsx
<OfferingDetailsDisclosure
  cards={cards}
  description={description}
  emptyLabel={t('group.roomInfoPending')}
  collapsedSummary={cards.length ? <RoomCompactSpecs cards={cards} /> : undefined}
/>
```

Do not change `RoomCompactSpecs`, `OfferingDetailsDisclosure`, or any booking behavior.

- [x] **Step 3: Verify the desktop collapsed and expanded states**

Reload the same page at 1280×900 and verify:

```text
Collapsed: four summary items appear between the photo strip and “Xem chi tiết”.
Expanded: clicking “Xem chi tiết” hides the summary and shows the complete attribute list plus description.
Collapsed again: clicking “Thu gọn” restores the four-item summary without changing scroll or booking state.
```

- [x] **Step 4: Verify responsive behavior remains coherent**

Reload at 390×844 and 768×900 and verify:

```text
The existing compact room card still shows the same four-item summary once.
The details toggle still reveals the complete information.
No horizontal page overflow appears.
```

- [x] **Step 5: Run focused and repository-required checks**

Run:

```bash
pnpm --filter=@booking/storefront lint
pnpm --filter=@booking/storefront typecheck
pnpm --filter=@booking/storefront build
pnpm check:no-tests
pnpm check:module-cycles
pnpm check:frontend-structure
pnpm check:theme-tokens
pnpm --filter=@booking/storefront security
pnpm --filter=@booking/api check:rls
pnpm turbo lint typecheck build
git diff --check -- apps/storefront/app/features/listing-group/components/room-cells.tsx
```

Expected: every command exits 0. Existing Vite sourcemap-location warnings may appear during build, but the client and SSR builds must finish successfully.

- [x] **Step 6: Review the scoped diff**

Run:

```bash
git diff -- apps/storefront/app/features/listing-group/components/room-cells.tsx
git status --short apps/storefront/app/features/listing-group/components/room-cells.tsx
```

Expected: the unstaged implementation diff changes only the `collapsedSummary` condition; pre-existing staged/user changes remain untouched.
