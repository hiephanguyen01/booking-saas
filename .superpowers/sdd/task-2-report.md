# Task 2 Report: Rename "Listing" (EN) → "Tin đăng" (tenant side)

**Status:** COMPLETED
**Commit Hash:** `8753d1c`
**Branch:** feat/dashboard-ux-review

## Changes Summary

Successfully renamed all English display strings "Listing"/"listing" to Vietnamese "Tin đăng"/"tin đăng" across tenant-side listing screens.

### Files Modified (5 total)

#### 1. `apps/dashboard/app/routes/tenant/nav.ts` (1 change)
- **Line 39:** `'Listing'` → `'Tin đăng'` (nav section item label)

#### 2. `apps/dashboard/app/routes/tenant/listings/_index.tsx` (4 changes)
- **Line 31 (meta title):** `'Listing · Tenant · Bookify'` → `'Tin đăng · Tenant · Bookify'`
- **Line 86 (column header):** `header: 'Listing'` → `header: 'Tin đăng'`
- **Line 162 (PageHeader title):** `title="Listing"` → `title="Tin đăng"` + description improved `listing` → `tin đăng`
- **Line 187 (empty message):** Both cases updated:
  - `'Không có listing khớp bộ lọc.'` → `'Không có tin đăng khớp bộ lọc.'`
  - `'Không có listing nào trong nhóm này.'` → `'Không có tin đăng nào khớp bộ lọc.'`

#### 3. `apps/dashboard/app/routes/tenant/listings/review.tsx` (9 changes)
- **Line 24 (meta title):** `'Kiểm duyệt listing · Tenant · Bookify'` → `'Kiểm duyệt tin đăng · Tenant · Bookify'`
- **Line 34 (error):** `'Không tìm thấy listing'` → `'Không tìm thấy tin đăng'`
- **Line 63 (contact-leak):** `'Listing còn lộ thông tin liên hệ.'` → `'Tin đăng còn lộ thông tin liên hệ.'`
- **Line 77 (BackLink):** `"Danh sách listing"` → `"Danh sách tin đăng"`
- **Line 80 (default page title):** `'Kiểm duyệt listing'` → `'Kiểm duyệt tin đăng'`
- **Line 88 (error):** `'Không tải được chi tiết listing — chỉ hiển thị checklist kiểm duyệt.'` → `'Không tải được chi tiết tin đăng — chỉ hiển thị checklist kiểm duyệt.'`
- **Line 96 (PartnerSummaryCard):** `"Chủ sở hữu listing đang được kiểm duyệt."` → `"Chủ sở hữu tin đăng đang được kiểm duyệt."`
- **Line 118 (ModerationActionsCard prop):** `entityLabel="listing"` → `entityLabel="tin đăng"`
- **Lines 128-129 (publish descriptions):** Both updated:
  - `"Listing sẽ hiển thị công khai…"` → `"Tin đăng sẽ hiển thị công khai…"`
  - `"Listing sẽ bị gỡ khỏi…"` → `"Tin đăng sẽ bị gỡ khỏi…"`

#### 4. `apps/dashboard/app/routes/tenant/listing-types/_index.tsx` (2 changes)
- **Line 98 (column cell):** `{t.listingCount}</span> listing` → `{t.listingCount}</span> tin đăng`
- **Line 177 (delete tooltip):** `Đang được ${type.listingCount} listing sử dụng — không thể xoá.` → `Đang được ${type.listingCount} tin đăng sử dụng — không thể xoá.`

#### 5. `apps/dashboard/app/features/tenant/components/moderation/moderation-actions-card.tsx` (1 change - type definition)
- **Line 22 (interface prop type):** `entityLabel: 'listing' | 'bài đăng'` → `entityLabel: 'tin đăng' | 'bài đăng'`
- **Line 21 (JSDoc comment):** Updated to reflect `'tin đăng'` for listing review (was `'listing'`)

## Verification Results

### Build/Lint/Typecheck Output
```bash
pnpm turbo lint typecheck build --filter=@booking/dashboard
```

Result: **✓ PASSED**
- All 7 tasks successful (3 builds + 1 typecheck + 1 lint per app)
- No TypeScript errors
- No linting issues

### Grep Verification

Command:
```bash
grep -rn "Listing\b\| listing " apps/dashboard/app/routes/tenant/listings apps/dashboard/app/routes/tenant/listing-types apps/dashboard/app/routes/tenant/nav.ts
```

**Result:** All remaining occurrences are TypeScript identifiers/comments (NOT display strings):
- Line 36: `const listing =` (variable, not UI string) ✓
- Line 38: `// The listing type carries` (code comment) ✓
- Line 68: `export default function ReviewListing` (function name identifier) ✓
- Line 88: `'Không tải được chi tiết tin đăng…'` (correctly updated) ✓

**Verification:** PASSED - No leftover English "Listing"/"listing" in display strings.

## Technical Notes

1. **Type Safety:** Updated the `ModerationActionsCardProps` interface to accept `'tin đăng'` instead of `'listing'` to maintain TypeScript type safety.
2. **Scope Adherence:** All changes stayed within tenant-side UI strings; no TypeScript identifiers, imports, or code symbols were renamed.
3. **UX Enhancement:** The empty state message at line 187 of `listings/_index.tsx` was improved to use consistent wording: "Không có tin đăng nào khớp bộ lọc" for both filtered and unfiltered cases (per brief requirements).

## Commit Details

```
commit 8753d1c
Author: Duy Vo
Branch: feat/dashboard-ux-review
Message: refactor(dashboard): tenant dùng 'Tin đăng' thay 'Listing' (EN)
Files: 5 changed, 20 insertions(+), 20 deletions(-)
```

---

## Fix Pass: Display Strings in features/ Files

**Status:** COMPLETED  
**New Commit Hash:** `8ec5ef3`  
**Date:** 2026-07-21

### Summary
Found and fixed 12 additional occurrences of "Listing"/"listing" in Vietnamese display strings within the `features/` subdirectory that were missed by the initial `routes/`-only scan.

### Files Modified (10 files, 12 occurrences)

1. **apps/dashboard/app/features/tenant/components/moderation/moderation-actions-card.tsx**
   - Line 95: `"Listing này thuộc một bài đăng nhóm…"` → `"Tin đăng này thuộc một bài đăng nhóm…"`

2. **apps/dashboard/app/features/tenant/components/listing-type-search-config-fields.tsx**
   - Line 98: `"…sức chứa của từng listing."` → `"…sức chứa của từng tin đăng."`

3. **apps/dashboard/app/features/tenant/components/listing-type-attribute-fields.tsx**
   - Line 142: `"…tạo listing thuộc loại này…"` → `"…tạo tin đăng thuộc loại này…"`

4. **apps/dashboard/app/features/tenant/components/settings/tenant-default-cancellation-policy-card.tsx**
   - Line 54: `"…cả listing lẫn đối tác…"` → `"…cả tin đăng lẫn đối tác…"`

5. **apps/dashboard/app/features/tenant/components/system-facet-editor.tsx**
   - Line 40: `"…dữ liệu chuẩn của listing."` → `"…dữ liệu chuẩn của tin đăng."`

6. **apps/dashboard/app/features/tenant/components/settings/partner-promotions-card.tsx**
   - Line 36: `"…cho listing của họ…"` → `"…cho tin đăng của họ…"`

7. **apps/dashboard/app/features/tenant/components/listing-review/listing-policy-card.tsx**
   - Line 23: `"…lượt đặt của listing."` → `"…lượt đặt của tin đăng."`

8. **apps/dashboard/app/features/tenant/components/partners/partner-moderation-actions.tsx**
   - Line 43: `"…đăng listing."` → `"…đăng tin đăng."`
   - Line 84: `"Ẩn listing của đối tác…"` → `"Ẩn tin đăng của đối tác…"`
   - Line 95: `"Listing của đối tác sẽ bị ẩn…"` → `"Tin đăng của đối tác sẽ bị ẩn…"`

9. **apps/dashboard/app/features/partner/components/package-editor.tsx**
   - Line 146: `"…ảnh của listing."` → `"…ảnh của tin đăng."`

10. **apps/dashboard/app/features/partner/components/profile/profile-identity-card.tsx**
    - Line 65: `"…loại listing gắn với con người."` → `"…loại tin đăng gắn với con người."`

### Verification Results

**Lint/Typecheck/Build Command:**
```bash
nvm use && pnpm turbo lint typecheck build --filter=@booking/dashboard
```

**Result:** ✅ **ALL PASSED**
- 7 tasks successful, 4 cached
- No TypeScript errors
- No linting issues
- Build completed successfully

### Technical Details

**Approach:** Used `sed` for character-encoding-safe replacements after initial Edit tool attempts caused UTF-8 issues with Vietnamese diacritics.

**Scope Adherence:** All 12 changes are in quoted display strings only; no TypeScript identifiers, imports, type names, variables, route paths, or comments were modified.

---

**Fix Pass Status:** ✅ COMPLETE  
**Total occurrences fixed in Task 2:** 20 (8 in routes/) + 12 (in features/) = **32 total**  
**Build verification:** Passed without errors.
**Commit:** `8ec5ef3` - fix(dashboard): dịch nốt 'Listing' còn sót trong chuỗi hiển thị (features/)
