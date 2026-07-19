# Task 1 — Localized booking financial summary

## Status

DONE

Commit: `4bea39461e9848eaff2a894a0b2fb8ac13487d95` — `feat(storefront): add booking financial summary`

## Implemented

- Added matching `bookings.payment.paidDeposit` and `bookings.payment.paidInFull` copy in Vietnamese and English account locales.
- Added `BookingFinancialSummary`, a reusable semantic three-column `dl` for booking paid, total, and remaining values.
- Values are formatted as VND with `formatCurrency(BigInt(...), 'VND', locale)`.
- The remaining column uses the tenant primary color only when a positive balance remains; otherwise it displays the localized paid-in-full message in the positive tone.

## Verification

All commands below exited with code 0.

```bash
pnpm --filter=@booking/i18n build
pnpm --filter=@booking/storefront lint
pnpm --filter=@booking/storefront typecheck
git diff --check
git diff --cached --check
```

The i18n build completed both TypeScript output targets, storefront lint completed `eslint app`, and storefront typecheck completed React Router type generation followed by `tsc`.

No tests were created or run, per the repository's explicit no-tests policy.

## Files changed

- `apps/storefront/app/features/account/components/booking-financial-summary.tsx` (new)
- `packages/i18n/src/locales/vi/account.ts`
- `packages/i18n/src/locales/en/account.ts`

## Self-review

- Confirmed the component uses `dl`, `dt`, and `dd` semantically.
- Confirmed each financial cell has the required compact, responsive spacing and wrapping-safe tabular-number presentation.
- Confirmed the two new locale keys are present in both translation shapes and passed the typed i18n build.
- Confirmed the commit contains only the three Task 1 source files (72 insertions).

## Concerns

None for Task 1. Pre-existing, unrelated `.superpowers/sdd/progress.md` modification and the task brief file were left uncommitted.
