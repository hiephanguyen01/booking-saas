# Detail Range Calendar Style Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the listing detail daily range calendar visually match the storefront search range calendar.

**Architecture:** Reuse the storefront's existing `sf-calendar` CSS contract rather than duplicating range styles. The detail calendar keeps its current container styling and booking behavior while opting into the same cell size and state selectors as Search.

**Tech Stack:** React 19, React Router 8, TypeScript, Tailwind CSS v4, shadcn Calendar/react-day-picker.

## Global Constraints

- Do not add automated tests; repository verification is lint, typecheck, build, and running the app.
- Do not change URL state, availability rules, range normalization, or booking timestamps.
- Preserve unrelated user changes in the dirty worktree.

---

### Task 1: Reuse Search range styling in the detail calendar

**Files:**
- Modify: `apps/storefront/app/templates/studio/booking-panel.tsx:564`

**Interfaces:**
- Consumes: `.sf-calendar` selectors from `apps/storefront/app/app.css` and the shared `Calendar` component.
- Produces: The existing `DailyPicker` with Search-equivalent range styling; no new API or exported type.

- [ ] **Step 1: Record the current visual mismatch**

Open `/vi/l/studio-a-han-quoc?mode=daily`, choose an available start and end date, and inspect the range. Confirm the detail calendar does not have the `sf-calendar` class while `SearchDatePicker` does.

- [ ] **Step 2: Apply the existing Search styling contract**

Change the detail calendar class composition to:

```tsx
<Calendar
  mode="range"
  selected={range}
  onSelect={onSelect}
  disabled={isDisabled}
  excludeDisabled
  className="sf-calendar w-full rounded-lg border border-border bg-background/40 p-2 [--cell-size:2.25rem]"
/>
```

Do not change any other `DailyPicker` props or functions.

- [ ] **Step 3: Verify the detail and Search range states**

In the running storefront, select ranges in both the Search calendar and detail calendar. Confirm:

- From and To use primary background and primary foreground.
- Middle days use the same soft primary background.
- Hover states match.
- Today remains visually inactive until selected.
- Selecting dates in detail does not scroll to the page top.

- [ ] **Step 4: Run static verification**

Run:

```bash
pnpm --filter=@booking/storefront exec eslint app/templates/studio/booking-panel.tsx
pnpm --filter=@booking/storefront typecheck
pnpm --filter=@booking/storefront build
git diff --check
```

Expected: every command exits with status 0. Existing Vite source-map warnings may remain, but the build must complete successfully.

- [ ] **Step 5: Commit only the implementation file**

```bash
git add apps/storefront/app/templates/studio/booking-panel.tsx
git commit -m "fix(storefront): align detail range calendar styling"
```

Do not stage the user's unrelated modified files.
