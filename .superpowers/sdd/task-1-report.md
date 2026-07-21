# Task 1 Report: Sửa 2 lỗi thuật ngữ sai nghĩa

## Files Changed

### 1. `apps/dashboard/app/features/tenant/constants.ts` (lines 52-57)

**Before:**
```ts
export const SEARCH_SCHEDULE_LABEL: Record<ListingTypeSearchSchedule, string> = {
  none: 'Không dùng lịch',
  hourly: 'Theo ngày',
  daily: 'Theo khoảng ngày',
  inventory: 'Theo khoảng thuê kho',
};
```

**After:**
```ts
export const SEARCH_SCHEDULE_LABEL: Record<ListingTypeSearchSchedule, string> = {
  none: 'Không dùng lịch',
  hourly: 'Theo giờ',
  daily: 'Theo ngày',
  inventory: 'Theo kho',
};
```

**Changes:**
- `hourly`: 'Theo ngày' → 'Theo giờ' (fix: was incorrectly labeled as daily)
- `daily`: 'Theo khoảng ngày' → 'Theo ngày' (simplify and fix ambiguity)
- `inventory`: 'Theo khoảng thuê kho' → 'Theo kho' (simplify)

### 2. `apps/dashboard/app/routes/tenant/listing-groups/_index.tsx` (line 201)

**Before:**
```tsx
<Undo2 data-icon="inline-start" /> Mở lại
```

**After:**
```tsx
<Undo2 data-icon="inline-start" /> Đăng lại
```

**Change:** Button label for republish action changed from "Mở lại" → "Đăng lại" (consistent verb across tenant/partner UI).

### 3. Partner-side verification

**Already consistent (no changes needed):**
- `apps/dashboard/app/features/partner/components/listings/listing-row-actions.tsx:63` — already has "Đăng lại" ✓
- `apps/dashboard/app/features/partner/components/listing-groups/listing-group-lifecycle.tsx:108` — already has "Đăng lại" ✓

## Build Verification

**Command executed:**
```bash
cd /Volumes/OVEN\ Duy/temp/booking-saas && nvm use && pnpm turbo lint typecheck build --filter=@booking/dashboard
```

**Result: PASS**
- Lint: ✓ passed
- Typecheck: ✓ passed
- Build: ✓ passed
  - Client build: completed successfully (487.00 kB listing-type-form)
  - SSR build: completed successfully (2,596.69 kB server/index.js)
  - Total tasks: 7 successful, 7 total
  - Total time: 10.069s

No errors or type violations. Sourcemap warnings in Vite build are non-fatal and pre-existing.

## Commit Details

**Hash:** `71d0ab7`

**Command:**
```bash
git add apps/dashboard/app/features/tenant/constants.ts apps/dashboard/app/routes/tenant/listing-groups/_index.tsx
git commit -m "fix(dashboard): sửa nhãn search-schedule đảo nghĩa + thống nhất verb 'Đăng lại'"
```

**Commit message:** `fix(dashboard): sửa nhãn search-schedule đảo nghĩa + thống nhất verb 'Đăng lại'`

## Verification Notes

- **SEARCH_SCHEDULE_LABEL fix:** Aligns search schedule labels with `BOOKING_MODE_LABEL` in `apps/dashboard/app/constants/booking.ts`. The "hourly" value is now correctly labeled "Theo giờ" instead of the duplicate "Theo ngày" (daily).
- **Republish verb consistency:** The tenant-side listing-groups list page republish button now matches the partner-side terminology ("Đăng lại"), ensuring consistent UX vocabulary across both dashboard areas.
- **No breaking changes:** Only visible text strings changed; no TypeScript identifiers, types, enum values, routes, or query parameters were modified.
- **No API impact:** The `republish` intent value and all query parameters remain unchanged.

## Status

✅ **DONE** — All changes completed, verified, and committed.
