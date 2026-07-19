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

