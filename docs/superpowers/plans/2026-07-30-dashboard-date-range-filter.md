# Dashboard Date Range Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace separate dashboard date inputs with one contextual date-range popup and move `/partner/bookings` status filtering from tabs into the toolbar.

**Architecture:** Keep `FilterField.kind === 'date-range'`, its `fromKey`/`toKey` URL contract, and all loader/API parsing unchanged. Move the interactive draft/apply behavior into a focused dashboard component used by `ListToolbar`; define partner booking status as a route-level enum filter so `DashboardDataTable` remains domain-agnostic.

**Tech Stack:** React 19, React Router 8 framework mode, TypeScript, Tailwind CSS, Radix/shadcn Popover from `@booking/ui`, Lucide icons, pnpm.

## Global Constraints

- Never create test files, test configuration, test scripts, or CI test steps.
- Frontends never fetch authenticated API data from the browser; retain loader/action data flow.
- Preserve existing `from`, `to`, `status`, `pageSize`, and unrelated URL parameters.
- Date presets use Vietnam time and Monday-through-Sunday weeks.
- The trigger shows its contextual label when inactive and `dd/MM/yyyy – dd/MM/yyyy` when active.
- Do not modify contracts, API endpoints, repositories, table pagination, or shadcn primitives.

---

### Task 1: Build the shared date-range filter component

**Files:**
- Create: `apps/dashboard/app/components/date-range-filter.tsx`

**Interfaces:**
- Consumes: `Extract<FilterField, { kind: 'date-range' }>`, the current applied `from`/`to` strings, and an apply callback.
- Produces:

```ts
interface DateRangeFilterProps {
  field: Extract<FilterField, { kind: 'date-range' }>;
  from: string;
  to: string;
  onApply: (from: string, to: string) => void;
  className?: string;
}

export function DateRangeFilter(props: DateRangeFilterProps): React.ReactNode;
```

- [ ] **Step 1: Add Vietnam calendar helpers**

Implement focused private helpers in the component:

```ts
type DateRangeValue = { from: string; to: string };
type DatePreset = { label: string; getValue: (today: Date) => DateRangeValue };

function marketToday(now = new Date()): Date;
function toDayValue(date: Date): string;
function formatDayValue(value: string): string;
function presetRange(kind: 'today' | 'yesterday' | 'thisWeek' | 'lastWeek' | 'thisMonth' | 'lastMonth', now?: Date): DateRangeValue;
```

Use `Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' })` to derive the Vietnam calendar date. Perform preset arithmetic on a UTC-noon date constructed from those date parts so the browser's local timezone cannot shift a day. Compute Monday offset as `(getUTCDay() + 6) % 7`.

- [ ] **Step 2: Add contextual trigger formatting**

Return `field.label` when both endpoints are empty. Return `dd/MM/yyyy – dd/MM/yyyy` for a full range. Preserve legacy one-sided ranges as `Từ dd/MM/yyyy` or `Đến dd/MM/yyyy`.

- [ ] **Step 3: Compose the popup**

Use `Popover`, `PopoverTrigger`, and `PopoverContent` from `@booking/ui`. The trigger is an outline button with a chevron and full-width mobile sizing. The content contains:

```tsx
<h2>{field.label}</h2>
<div>
  <label htmlFor={`${field.fromKey}-draft`}>Từ ngày</label>
  <input id={`${field.fromKey}-draft`} type="date" />
  <ArrowRight aria-hidden />
  <label htmlFor={`${field.toKey}-draft`}>Đến ngày</label>
  <input id={`${field.toKey}-draft`} type="date" />
</div>
```

Render exactly six preset buttons: Hôm nay, Hôm qua, Tuần này, Tuần trước, Tháng này, Tháng trước.

- [ ] **Step 4: Implement draft/apply lifecycle**

Control `open`, `draftFrom`, and `draftTo` locally. When the popover opens, copy the applied values into draft state. Presets update draft only. `Áp dụng` calls `onApply(draftFrom, draftTo)` and closes; `Đóng` restores applied values and closes. Radix outside-click and Escape close through `onOpenChange(false)` and discard draft on the next open.

- [ ] **Step 5: Verify component structure**

Run:

```bash
pnpm exec prettier --check apps/dashboard/app/components/date-range-filter.tsx
pnpm --filter=@booking/dashboard typecheck
```

Expected: both commands exit 0 with no test files created.

---

### Task 2: Integrate date range with the shared GET toolbar

**Files:**
- Modify: `apps/dashboard/app/components/list-toolbar.tsx`

**Interfaces:**
- Consumes: `DateRangeFilter` from Task 1.
- Produces: unchanged public `ListToolbar` props and unchanged `FilterField` contract.

- [ ] **Step 1: Add an override-based submit helper**

Add:

```ts
const submitWithOverrides = (
  form: HTMLFormElement,
  overrides: Record<string, string>,
) => {
  const data = new FormData(form);
  for (const [key, value] of Object.entries(overrides)) {
    if (value) data.set(key, value);
    else data.delete(key);
  }
  data.delete('page');
  submit(data, { method: 'get', replace: true });
};
```

Keep the existing mounted/connected guard. This ensures Apply submits the new values immediately without relying on asynchronous controlled-input rendering.

- [ ] **Step 2: Render hidden applied date values**

For each date-range field, render hidden inputs only when its applied values are non-empty:

```tsx
{from ? <input type="hidden" name={field.fromKey} value={from} /> : null}
{to ? <input type="hidden" name={field.toKey} value={to} /> : null}
```

Do not render named draft inputs inside the popup.

- [ ] **Step 3: Replace the two date controls**

Change `ToolbarField` so its date-range branch renders `DateRangeFilter`. Pass an `onDateRangeApply` callback that finds the enclosing toolbar form and invokes `submitWithOverrides` with the field's two URL keys.

- [ ] **Step 4: Preserve all existing toolbar behavior**

Confirm:

- search still debounces for 300 ms;
- native enum fields still submit immediately;
- unknown query parameters and `pageSize` remain hidden form inputs;
- submitting any toolbar control omits `page`;
- split and inline layouts both render the new compact filter.

- [ ] **Step 5: Run focused static verification**

Run:

```bash
pnpm check:frontend-structure
pnpm --filter=@booking/dashboard lint
pnpm --filter=@booking/dashboard typecheck
```

Expected: all commands exit 0.

---

### Task 3: Apply contextual labels across dashboard date filters

**Files:**
- Modify: `apps/dashboard/app/features/bookings/lib/booking-filters.ts`
- Modify: `apps/dashboard/app/features/payments/lib/payment-filters.ts`
- Modify: `apps/dashboard/app/features/promotions/lib/promotion-filters.ts`
- Modify: `apps/dashboard/app/features/reviews/lib/review-filters.ts`
- Modify: `apps/dashboard/app/routes/affiliate/commissions.tsx`
- Modify: `apps/dashboard/app/routes/tenant/finance/ledger.tsx`

**Interfaces:**
- Consumes: existing `FilterField.label`.
- Produces: contextual inactive trigger text without changing URL keys.

- [ ] **Step 1: Replace generic labels**

Apply these exact labels:

```ts
// BOOKINGS_FILTER_SPEC
label: 'Ngày đặt'

// PAYMENT_FILTER_SPEC
label: 'Ngày giao dịch'

// PROMOTION_FILTER_SPEC
label: 'Ngày tạo'

// REVIEW_FILTER_SPEC
label: 'Ngày tạo'

// COMMISSION_FILTER_SPEC
label: 'Ngày tạo'

// LEDGER_FILTER_SPEC
label: 'Ngày ghi nhận'
```

- [ ] **Step 2: Confirm complete date-range coverage**

Run:

```bash
rg -n -C 1 "kind: 'date-range'" apps/dashboard/app
```

Expected: every result has a contextual label and no `label: 'Ngày'` remains.

- [ ] **Step 3: Run dashboard typecheck**

Run:

```bash
pnpm --filter=@booking/dashboard typecheck
```

Expected: exit 0.

---

### Task 4: Replace partner booking tabs with a status filter

**Files:**
- Modify: `apps/dashboard/app/routes/partner/bookings/_index.tsx`

**Interfaces:**
- Consumes: the existing `STATUS_FILTERS` values and labels.
- Produces: `PARTNER_BOOKINGS_FILTER_SPEC: FilterSpec` containing search, date range, and status enum fields.

- [ ] **Step 1: Define a route-level filter spec**

Keep the shared bookings spec unchanged for tenant bookings. Add:

```ts
const PARTNER_BOOKINGS_FILTER_SPEC: FilterSpec = [
  ...BOOKINGS_FILTER_SPEC,
  {
    kind: 'enum',
    key: 'status',
    label: 'Trạng thái',
    options: STATUS_FILTERS.filter(({ value }) => value !== 'all'),
  },
];
```

Set `allLabel: 'Tất cả trạng thái'`.

- [ ] **Step 2: Parse status through the shared filter reader**

Call:

```ts
const { filters, apiFilters } = readListFilters(
  url.searchParams,
  PARTNER_BOOKINGS_FILTER_SPEC,
);
```

Pass `apiFilters` directly through `toApiQuery`. Remove manual `STATUS_VALUES`, `statusRaw`, and duplicate `status` validation.

- [ ] **Step 3: Remove tab rendering**

Pass `filters={PARTNER_BOOKINGS_FILTER_SPEC}` to `DashboardDataTable` and remove its `tabs` prop. Remove `filterHref`, `statusValue`, and any now-unused imports.

- [ ] **Step 4: Preserve booking behavior**

Keep `pendingCount`, actions, permissions, columns, error handling, empty copy, URL key `status`, and API endpoint unchanged.

- [ ] **Step 5: Run focused verification**

Run:

```bash
pnpm --filter=@booking/dashboard lint
pnpm --filter=@booking/dashboard typecheck
pnpm --filter=@booking/dashboard build
```

Expected: all commands exit 0.

---

### Task 5: Full static and visual verification

**Files:**
- Create during QA: `design-qa.md`

**Interfaces:**
- Consumes: the completed shared filter and partner booking route.
- Produces: passing repository checks and visual evidence.

- [ ] **Step 1: Run the repository policy and architecture gates**

Run:

```bash
pnpm check:no-tests
pnpm check:module-cycles
pnpm check:frontend-structure
pnpm --filter=@booking/storefront security
```

Expected: all commands exit 0.

- [ ] **Step 2: Run lint, typecheck, build, and RLS**

Run:

```bash
pnpm turbo lint typecheck build
pnpm --filter=@booking/api check:rls
```

Expected: Turbo completes all tasks and RLS reports full coverage.

- [ ] **Step 3: Verify in the in-app browser**

At `http://localhost:5174/partner/bookings`, confirm:

- no status tabs are rendered;
- status is a toolbar dropdown and updates `status` in the URL;
- inactive date trigger says `Ngày đặt`;
- the popup contains exactly six presets;
- applying a range shows `dd/MM/yyyy – dd/MM/yyyy`, resets page, and preserves status/pageSize/search;
- Close and Escape do not apply draft values;
- mobile toolbar wraps without page-level horizontal overflow;
- table horizontal scrolling remains isolated;
- browser console has no errors.

Check at least one payment/review/ledger dashboard list to confirm the shared contextual labels.

- [ ] **Step 4: Complete screenshot comparison QA**

Capture the closed trigger and open popup at equivalent states to the supplied references. Create
`design-qa.md` with source paths, implementation capture paths, viewport/density, interaction checks,
comparison findings, iteration history, and exactly `final result: passed` once no P0/P1/P2 issues
remain.

- [ ] **Step 5: Commit implementation**

```bash
git add apps/dashboard/app/components/date-range-filter.tsx \
  apps/dashboard/app/components/list-toolbar.tsx \
  apps/dashboard/app/features/bookings/lib/booking-filters.ts \
  apps/dashboard/app/features/payments/lib/payment-filters.ts \
  apps/dashboard/app/features/promotions/lib/promotion-filters.ts \
  apps/dashboard/app/features/reviews/lib/review-filters.ts \
  apps/dashboard/app/routes/affiliate/commissions.tsx \
  apps/dashboard/app/routes/tenant/finance/ledger.tsx \
  apps/dashboard/app/routes/partner/bookings/_index.tsx \
  design-qa.md
git commit -m "feat(dashboard): add shared date range filter"
```

Expected: a focused implementation commit on `codex/dashboard-table-rollout`.
