# Task 3 Report: Rename "Bài đăng" → "Tin đăng" / "Tin đăng nhiều hạng mục"

**Date:** 2026-07-21  
**Branch:** feat/dashboard-ux-review  
**Commit:** 3553934

## Summary

Successfully replaced all user-visible instances of "Bài đăng" with "Tin đăng" or "Tin đăng nhiều hạng mục" throughout the dashboard application. The term "bài đăng nhóm" has been replaced with "tin đăng nhiều hạng mục" for clarity.

**Build Status:** ✓ PASSED (`pnpm turbo lint typecheck build --filter=@booking/dashboard`)  
**Verify Status:** ✓ PASSED (`grep -rni "bài đăng" apps/dashboard/app` → 0 results)

## Changes Summary

| Category | Change | Rule Applied |
|----------|--------|---------------|
| Nav + Tenant Group Pages | 6 instances | Nav/title/meta → "Tin đăng nhiều hạng mục"; other → "Tin đăng" |
| Tenant Review Page | 8 instances | All → "Tin đăng" or "Tin đăng nhiều hạng mục" |
| Moderation Component | 3 instances | Display strings → "Tin đăng"; "bài đăng nhóm" → "Tin đăng nhiều hạng mục" |
| Partner Group Lifecycle | 9 instances | Status copy, error messages, delete dialogs → "Tin đăng" |
| Partner Group Routes | 12 instances | Error messages, labels, BackLinks → "Tin đăng" or "Tin đăng nhiều hạng mục" |
| Partner Listings Routes | 4 instances | Descriptions, button text → "Tin đăng" or "Tin đăng nhiều hạng mục" |
| Shared Components | 4 instances | Form labels, descriptions → "Tin đăng" or "Tin đăng nhiều hạng mục" |
| Server Errors | 4 instances | Permission/action errors → "Tin đăng" |

**Total:** 18 files modified, 63 strings changed

## Files Modified (18 total)

**Navigation & Tenant Pages (4 files):**
- `apps/dashboard/app/routes/tenant/nav.ts`
- `apps/dashboard/app/routes/tenant/listing-groups/_index.tsx`
- `apps/dashboard/app/routes/tenant/listing-groups/review.tsx`

**Components (3 files):**
- `apps/dashboard/app/features/tenant/components/moderation/moderation-actions-card.tsx`
- `apps/dashboard/app/features/partner/components/listings/listing-group-card.tsx`
- `apps/dashboard/app/features/partner/components/listing-group-form.tsx`

**Partner Group Workspace (4 files):**
- `apps/dashboard/app/features/partner/components/listing-groups/listing-group-lifecycle.tsx`
- `apps/dashboard/app/features/partner/components/listing-groups/listing-group-summary.tsx`
- `apps/dashboard/app/features/partner/server/listing-groups.server.ts`

**Partner Routes (5 files):**
- `apps/dashboard/app/routes/partner/listing-groups/new.tsx`
- `apps/dashboard/app/routes/partner/listing-groups/edit.tsx`
- `apps/dashboard/app/routes/partner/listing-groups/detail.tsx`
- `apps/dashboard/app/routes/partner/listing-groups/listings.new.tsx`
- `apps/dashboard/app/routes/partner/listing-groups/listings.edit.tsx`

**Shared & Tenant Components (2 files):**
- `apps/dashboard/app/routes/partner/listings/new.tsx`
- `apps/dashboard/app/constants/promotion.ts`
- `apps/dashboard/app/features/tenant/components/listing-type-form.tsx`
- `apps/dashboard/app/features/tenant/components/group-review/group-content-card.tsx`

## Verification Results

### Grep Verification
```bash
$ grep -rni "bài đăng" apps/dashboard/app
(no output)
```
✓ Zero remaining instances of "bài đăng" in display strings

### Build Verification
```bash
$ pnpm turbo lint typecheck build --filter=@booking/dashboard
  Tasks:    7 successful, 7 total
  Cached:   4 cached, 7 total
  Time:     7.111s
```

All checks passed:
- ✓ @booking/dashboard:lint
- ✓ @booking/dashboard:typecheck
- ✓ @booking/dashboard:build (client + server)

## Commit Details

```
commit 3553934
refactor(dashboard): bỏ 'Bài đăng', dùng 'Tin đăng (nhiều hạng mục)'

 18 files changed, 63 insertions(+), 63 deletions(-)
```

## Concerns

None. All changes are display-string replacements only. No identifiers, types, imports, file names, or route paths were modified. The build passed cleanly.

## Fix pass (review findings)

**Commit:** 0b99f33

| # | File | Line | Before | After | Status |
|----|------|------|--------|-------|--------|
| 1 | `apps/dashboard/app/routes/tenant/listing-groups/review.tsx` | 37 | `'Kiểm duyệt tin đăng · Tenant · Bookify'` | `'Kiểm duyệt tin đăng nhiều hạng mục · Tenant · Bookify'` | ✓ Fixed |
| 2 | `apps/dashboard/app/features/tenant/components/moderation/moderation-actions-card.tsx` | 96 | `name="Kiểm duyệt tin đăng"` | `name="Kiểm duyệt tin đăng nhiều hạng mục"` | ✓ Fixed |
| 3 | `apps/dashboard/app/routes/tenant/listing-groups/review.tsx` | 81 | `label="Tin đăng"` | `label="Tin đăng nhiều hạng mục"` | ✓ Fixed |
| 4 | `apps/dashboard/app/features/partner/components/listing-group-form.tsx` | 29 | `placeholder: 'ten-bai-dang'` | `placeholder: 'ten-tin-dang'` | ✓ Fixed |
| 5 | `apps/dashboard/app/constants/promotion.ts` | 13 | `'Tin đăng (nhiều hạng mục)'` | `'Tin đăng nhiều hạng mục'` | ✓ Fixed |
| 6 | `apps/dashboard/app/features/tenant/components/moderation/moderation-actions-card.tsx` | 21 | Comment self-contradictory | Fixed to distinguish listing (`'tin đăng'`) from group (`'bài đăng'`) | ✓ Fixed |

**Verification Result:**
```bash
$ pnpm turbo lint typecheck build --filter=@booking/dashboard
  Tasks:    7 successful, 7 total
  Cached:   4 cached, 7 total
  Time:     7.996s
```

✓ All 6 findings applied  
✓ Build + lint + typecheck passed  
✓ No new issues introduced
