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

