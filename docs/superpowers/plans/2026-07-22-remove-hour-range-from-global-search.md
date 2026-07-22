# Remove Hour Range From Global Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the start/end time range from hourly global search submissions in both shared storefront search variants.

**Architecture:** Make one focused change in the shared `SearchForm`, which renders both the homepage hero and compact search bar. Remove only form-owned time state, rendering, validation, and dead UI code; retain URL parsing and downstream legacy-link support outside this component.

**Tech Stack:** React 19, React Router 8 SSR, TypeScript, Tailwind CSS, pnpm 10.13.1

## Global Constraints

- Do not create or run automated tests; the repository owner requires verification through typecheck, lint, build, and running the app.
- Keep hourly date selection unchanged.
- Keep existing parsing and downstream support for legacy URLs containing `startTime` and `endTime`.
- Do not change booking-time selection, API behavior, or backend contracts.
- Use pnpm only.

---

### Task 1: Remove Hour Range From Shared Search Form

**Files:**
- Modify: `apps/storefront/app/features/search/search-form.tsx:20-342`

**Interfaces:**
- Consumes: `SearchForm` props and `StorefrontSearchState` as currently defined.
- Produces: The existing `SearchForm` component with unchanged public props; hourly submissions contain `mode` and an optional `date`, but no `startTime` or `endTime` inputs.

- [ ] **Step 1: Remove form-owned time state and hourly time validation**

Delete these state declarations:

```tsx
const [startTime, setStartTime] = useState(state.startTime);
const [endTime, setEndTime] = useState(state.endTime);
```

Replace:

```tsx
const canSubmit =
  canSubmitSearch(mode, rangeFrom, rangeTo) &&
  (mode !== 'hourly' || fixedPackages || !date || startTime < endTime);
```

with:

```tsx
const canSubmit = canSubmitSearch(mode, rangeFrom, rangeTo);
```

- [ ] **Step 2: Remove the hourly time-range field from both form variants**

Delete the shared conditional render block:

```tsx
{mode === 'hourly' && !fixedPackages ? (
  <TimeRangeField
    startTime={startTime}
    endTime={endTime}
    onStartTimeChange={setStartTime}
    onEndTimeChange={setEndTime}
    disabled={!date}
  />
) : null}
```

Because both the `hero` and `bar` variants use this same block, no variant-specific code is needed.

- [ ] **Step 3: Remove dead component code and imports**

Delete `TimeRangeField` in full and remove `Clock3` from the `lucide-react` import list. Keep `SearchField` and all other controls unchanged.

- [ ] **Step 4: Run storefront typecheck**

Run:

```bash
pnpm --filter=@booking/storefront typecheck
```

Expected: exit code 0 with no TypeScript errors.

- [ ] **Step 5: Run storefront lint**

Run:

```bash
pnpm --filter=@booking/storefront lint
```

Expected: exit code 0 with no ESLint errors.

- [ ] **Step 6: Inspect the final diff**

Run:

```bash
git diff --check
git diff -- apps/storefront/app/features/search/search-form.tsx
```

Expected: no whitespace errors; the diff only removes the hour-range UI, its local state/validation, and dead import/component code.

- [ ] **Step 7: Commit the implementation**

```bash
git add apps/storefront/app/features/search/search-form.tsx
git commit -m "fix(storefront): remove hourly range from global search"
```
