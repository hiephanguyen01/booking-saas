# Room Booking Range Visual Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render the daily booking selection as a soft connected range with circular 44px endpoints inside the full-width calendar.

**Architecture:** Extend the shared `Calendar` with an opt-in `connectedRange` presentation flag. The shared component derives all visuals from DayPicker's existing range modifiers; `RoomBookingDialog` enables the flag only for daily range mode, leaving every other calendar unchanged.

**Tech Stack:** React, TypeScript, React DayPicker, Tailwind CSS v4, shadcn/ui.

## Global Constraints

- Do not add test files or test configuration; verification is lint, typecheck, build, and running the storefront.
- Keep day interaction targets at exactly `44x44px` in `RoomBookingDialog`.
- Do not change booking state, availability, pricing, quote, checkout, localization, focus behavior, or disabled-date behavior.
- Default `Calendar` rendering must remain unchanged unless `connectedRange` is explicitly enabled.

---

### Task 1: Add the opt-in connected range presentation

**Files:**
- Modify: `packages/ui/src/components/ui/calendar.tsx`

**Interfaces:**
- Consumes: React DayPicker modifiers `range_start`, `range_middle`, and `range_end`.
- Produces: optional `connectedRange?: boolean` on `Calendar`, defaulting to `false`.

- [ ] **Step 1: Add the presentation flag**

Add `connectedRange = false` to the component destructuring and `connectedRange?: boolean` to the local prop intersection. Forward the enabled state as `data-connected-range` on the DayPicker root.

- [ ] **Step 2: Build the band on range cells**

When `connectedRange` is enabled, style the `day` cell from its DayPicker data attributes:

```tsx
connectedRange &&
  'data-[range-middle=true]:bg-primary/10 data-[range-start=true]:bg-[linear-gradient(to_right,transparent_50%,color-mix(in_oklch,var(--primary)_10%,transparent)_50%)] data-[range-end=true]:bg-[linear-gradient(to_left,transparent_50%,color-mix(in_oklch,var(--primary)_10%,transparent)_50%)]'
```

Keep the cell height at `--cell-size`, allow the band to fill the equal-width column, and preserve week-boundary clipping. Ensure a cell that is both start and end does not display either half-band.

- [ ] **Step 3: Style range buttons without changing target size**

Use the root data attribute in `CalendarDayButton` so connected range middle buttons have a transparent background, normal foreground color, medium font weight, and no radius. Keep start/end buttons circular with primary background and primary foreground. Preserve existing focus-ring and disabled-state utilities.

- [ ] **Step 4: Check the shared component**

Run:

```bash
pnpm --filter=@booking/ui lint
pnpm --filter=@booking/ui typecheck
```

Expected: both commands exit `0` with no ESLint or TypeScript errors.

### Task 2: Enable the presentation for daily room booking only

**Files:**
- Modify: `apps/storefront/app/features/listing-group/components/room-booking-dialog.tsx`

**Interfaces:**
- Consumes: shared `Calendar` prop `connectedRange?: boolean`.
- Produces: connected range visuals only for the `mode="range"` daily calendar.

- [ ] **Step 1: Enable connected range**

Pass `connectedRange` to the `Calendar` using `mode="range"`. Do not add it to the hourly `mode="single"` calendar.

- [ ] **Step 2: Verify formatting and static checks**

Run:

```bash
pnpm exec prettier --check packages/ui/src/components/ui/calendar.tsx apps/storefront/app/features/listing-group/components/room-booking-dialog.tsx
pnpm --filter=@booking/storefront lint
pnpm --filter=@booking/storefront typecheck
pnpm --filter=@booking/storefront build
git diff --check
```

Expected: all commands exit `0`. Vite may print existing sourcemap warnings while the production build still exits `0`.

### Task 3: Verify range states in the running storefront

**Files:**
- No file changes.

**Interfaces:**
- Consumes: local route `/vi/g/seed-studio-group-01` and the daily room-booking flow.
- Produces: manual verification evidence for desktop and mobile.

- [ ] **Step 1: Verify desktop at `1280x720`**

Open the room booking dialog, switch to “Theo ngày,” and select a multi-day range crossing a week boundary. Confirm the range middle is a soft connected band, endpoints are primary circles, day buttons are `44x44px`, the calendar fills the padded body, and there is no horizontal overflow.

- [ ] **Step 2: Verify mobile at `390x844`**

Repeat single-day and multi-day selections. Confirm the drawer does not overflow, the range remains legible, the body can scroll, and the sticky footer stays visible.

- [ ] **Step 3: Verify interaction states**

Use keyboard navigation to focus and select dates. Confirm the focus ring remains visible, disabled dates cannot be selected, endpoints retain readable contrast, and no new browser console errors appear.
