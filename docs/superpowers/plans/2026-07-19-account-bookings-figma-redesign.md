# Account Bookings Figma Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the storefront account booking list and detail views around the compact Figma card hierarchy, including an immediately scannable paid-deposit, total, and remaining-balance summary.

**Architecture:** Keep the existing React Router loaders, actions, account shell, and `AccountBookingViewModel`. Add one focused presentation component for the three-value financial summary, then compose it into the booking list card and detail payment section. All copy stays in the typed account i18n namespace, all money remains decimal strings formatted through `@booking/i18n`, and no browser-to-API fetches are introduced.

**Tech Stack:** React 19, React Router 8 SSR, TypeScript, Tailwind CSS v4, shadcn/ui, Lucide React, i18next, `@booking/i18n`.

## Global Constraints

- Do not add test files, test configuration, test scripts, or CI test steps; project verification is lint, typecheck, build, and manual app inspection.
- Preserve server-to-server data loading through the existing route loaders and server modules.
- Preserve tenant-controlled semantic color tokens; do not hardcode the Figma reference's red brand color.
- Preserve both `vi` and `en` copy with matching translation shapes.
- Use `BigInt` for all money comparison and arithmetic; never convert money to floating point.
- Use relative imports inside `apps/storefront`.
- Preserve existing pay, cancel, chat, dispute, settlement, and review behavior.

---

### Task 1: Add localized financial-summary copy and component

**Files:**
- Create: `apps/storefront/app/features/account/components/booking-financial-summary.tsx`
- Modify: `packages/i18n/src/locales/vi/account.ts`
- Modify: `packages/i18n/src/locales/en/account.ts`

**Interfaces:**
- Consumes: `formatCurrency(value: bigint, currency: 'VND', locale: Locale)` from `@booking/i18n`.
- Produces: `BookingFinancialSummary({ paidAmount, finalAmount, balanceAmount, locale, className? })`.

- [ ] **Step 1: Add matching Vietnamese and English labels**

Extend the existing `bookings.payment` object in both locale files with the same keys:

```ts
// vi/account.ts
paidDeposit: 'Đã cọc',
paidInFull: 'Đã thanh toán đủ',

// en/account.ts
paidDeposit: 'Deposit paid',
paidInFull: 'Paid in full',
```

- [ ] **Step 2: Create the shared three-column financial summary**

Implement a semantic `dl` whose paid value is positive, total is neutral/strong, and remaining value uses tenant primary only when positive:

```tsx
import { formatCurrency, type Locale } from '@booking/i18n';
import { NsI18n, useTranslation } from '../../../lib/i18n';

interface BookingFinancialSummaryProps {
  paidAmount: string;
  finalAmount: string;
  balanceAmount: string;
  locale: Locale;
  className?: string;
}

export function BookingFinancialSummary({
  paidAmount,
  finalAmount,
  balanceAmount,
  locale,
  className = '',
}: BookingFinancialSummaryProps) {
  const { t } = useTranslation(NsI18n.Account);
  const hasBalance = BigInt(balanceAmount) > 0n;
  const money = (value: string) => formatCurrency(BigInt(value), 'VND', locale);

  return (
    <dl className={`grid grid-cols-3 divide-x divide-border/70 rounded-lg bg-muted/30 ${className}`}>
      <FinancialValue label={t('bookings.payment.paidDeposit')} value={money(paidAmount)} tone="positive" />
      <FinancialValue label={t('bookings.payment.total')} value={money(finalAmount)} strong />
      <FinancialValue
        label={t('bookings.payment.balance')}
        value={hasBalance ? money(balanceAmount) : t('bookings.payment.paidInFull')}
        tone={hasBalance ? 'primary' : 'positive'}
        strong
      />
    </dl>
  );
}
```

Keep `FinancialValue` private to the file, with `min-w-0 px-2.5 py-3 text-center sm:px-4`, a compact muted label, and a wrapping-safe `dd` using `tabular-nums`.

- [ ] **Step 3: Verify typed translations and component types**

Run: `pnpm --filter=@booking/i18n build && pnpm --filter=@booking/storefront typecheck`

Expected: both commands exit 0 with no missing translation key or TypeScript error.

- [ ] **Step 4: Commit the financial-summary unit**

```bash
git add apps/storefront/app/features/account/components/booking-financial-summary.tsx packages/i18n/src/locales/vi/account.ts packages/i18n/src/locales/en/account.ts
git commit -m "feat(storefront): add booking financial summary"
```

---

### Task 2: Recompose the booking list to match the Figma card hierarchy

**Files:**
- Modify: `apps/storefront/app/routes/account/bookings.tsx`
- Modify: `apps/storefront/app/features/account/components/booking-history-card.tsx`

**Interfaces:**
- Consumes: `BookingFinancialSummary` from Task 1 and the unchanged `AccountBookingViewModel`.
- Produces: the redesigned `BookingHistoryCard` used by the account bookings route.

- [ ] **Step 1: Tighten the page heading and tab bar**

Keep URL-backed `<Link>` tabs and their accessible `aria-current`, but match the Figma geometry:

```tsx
<nav
  aria-label={t('bookings.filters.label')}
  className="overflow-x-auto border-b border-border/70 bg-background shadow-[0_4px_16px_rgba(15,23,42,0.03)]"
>
  <div className="flex min-w-max">
    {/* existing filter map; use h-12 px-4 sm:px-5 and a 2px active underline */}
  </div>
</nav>
```

Retain error, empty, retry, and filtering behavior unchanged.

- [ ] **Step 2: Replace the card header with the Figma partner/code/status row**

Compose the header as a responsive two-sided row. The left side contains partner name plus the existing chat link; the right side contains the booking code link and `BookingStatusBadge`. On mobile, allow the two sides to wrap without overflow. Remove the large uppercase “order” block and keep placed-at as quiet secondary copy.

```tsx
<header className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-6">
  <div className="flex min-w-0 flex-wrap items-center gap-3">
    <p className="truncate text-sm font-medium">{booking.partnerName}</p>
    {/* existing chat Button/Link */}
  </div>
  <div className="flex flex-wrap items-center justify-end gap-2 text-xs">
    <Link to={detailPath} className="font-mono font-medium hover:text-primary hover:underline">
      {booking.code}
    </Link>
    <BookingStatusBadge status={booking.status} />
  </div>
</header>
```

- [ ] **Step 3: Rebuild the compact booking summary and schedule chips**

Use a `sm:grid-cols-[158px_minmax(0,1fr)]` content grid, a `4/3` image, listing title, resource name, one calendar line, and rounded neutral time/duration chips. Keep the existing placeholder, image alt, listing link, description, booking mode, guest/quantity, customer note, and expandable extras, but move non-primary facts below the schedule in a subdued compact row.

- [ ] **Step 4: Insert the financial strip and simplify the footer**

Place the shared component after the booking summary and before policy/actions:

```tsx
<BookingFinancialSummary
  paidAmount={booking.paidAmount}
  finalAmount={booking.finalAmount}
  balanceAmount={booking.balanceAmount}
  locale={locale}
  className="mx-5 mb-5 sm:mx-6"
/>
```

Remove the current 240px payment sidebar. Keep context-sensitive pay, detail, cancel, and chat behavior; show policy/refund/no-show notes on the left and actions on the right, mirroring Figma.

- [ ] **Step 5: Verify the list implementation**

Run: `pnpm --filter=@booking/storefront lint && pnpm --filter=@booking/storefront typecheck`

Expected: both commands exit 0.

- [ ] **Step 6: Commit the list redesign**

```bash
git add apps/storefront/app/routes/account/bookings.tsx apps/storefront/app/features/account/components/booking-history-card.tsx
git commit -m "feat(storefront): redesign account booking list"
```

---

### Task 3: Recompose booking detail to match the second Figma frame

**Files:**
- Modify: `apps/storefront/app/features/account/components/booking-detail-panel.tsx`

**Interfaces:**
- Consumes: unchanged `AccountBookingViewModel`, settlement response, actions, and `BookingFinancialSummary` from Task 1.
- Produces: the existing `BookingDetailPanel` API with a new visual composition only.

- [ ] **Step 1: Align the back row and primary booking panel**

Keep the existing back link and action-error alert. Restyle the main section as square-to-soft panels matching Figma: compact partner/code/status header, horizontal listing summary, schedule chips, attribute/extra information, and a policy/action footer. Preserve all conditional actions and content.

- [ ] **Step 2: Separate contact and payment into stacked Figma panels**

Replace the current `md:grid-cols-2` split with distinct full-width sections. Contact rows use label/value columns with thin separators. Payment uses the existing detailed rows and begins with `BookingFinancialSummary` to repeat the three most important values before the full breakdown.

```tsx
<BookingFinancialSummary
  paidAmount={booking.paidAmount}
  finalAmount={booking.finalAmount}
  balanceAmount={booking.balanceAmount}
  locale={locale}
  className="mb-5"
/>
```

Do not remove discount, security deposit, additional-charge, refund, settlement, dispute, or review information.

- [ ] **Step 3: Preserve state-specific detail behavior**

Confirm the composition still renders:

- pending payment: pay form;
- confirmed: cancel dialog;
- completed: payment summary and review when available;
- cancelled/refunded: cancellation or post-service refund summary;
- no-show: no-refund guidance and dispute action.

- [ ] **Step 4: Verify the detail implementation**

Run: `pnpm --filter=@booking/storefront lint && pnpm --filter=@booking/storefront typecheck`

Expected: both commands exit 0.

- [ ] **Step 5: Commit the detail redesign**

```bash
git add apps/storefront/app/features/account/components/booking-detail-panel.tsx
git commit -m "feat(storefront): redesign account booking detail"
```

---

### Task 4: Full verification and visual review

**Files:**
- Modify only files from Tasks 1–3 if verification reveals issues.

**Interfaces:**
- Consumes: completed list/detail redesign.
- Produces: a verified production build with no known responsive or localization regressions.

- [ ] **Step 1: Run the storefront verification suite**

Run:

```bash
pnpm --filter=@booking/storefront lint
pnpm --filter=@booking/storefront typecheck
pnpm --filter=@booking/storefront build
```

Expected: all three commands exit 0. Do not run or add tests.

- [ ] **Step 2: Inspect the working tree**

Run: `git diff --check && git status --short`

Expected: no whitespace errors; status contains only intentional uncommitted fixes, or is clean.

- [ ] **Step 3: Manually inspect localized responsive states**

Run the existing storefront dev command and inspect `/vi/account/bookings` plus one booking detail at desktop and mobile widths. Repeat the primary list/detail scan in English. Confirm filter scrolling, card wrapping, three-column money summary, missing-image placeholder, keyboard focus, and available status actions.

- [ ] **Step 4: Commit verification fixes if needed**

```bash
git add apps/storefront packages/i18n/src/locales/vi/account.ts packages/i18n/src/locales/en/account.ts
git commit -m "fix(storefront): polish responsive booking views"
```

