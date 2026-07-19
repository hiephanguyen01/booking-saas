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

