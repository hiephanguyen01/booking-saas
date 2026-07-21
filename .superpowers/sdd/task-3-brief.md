### Task 3: Rename "Bài đăng" → "Tin đăng" / "Tin đăng nhiều hạng mục"

**Files:**
- Modify: `apps/dashboard/app/routes/tenant/nav.ts:45`
- Modify: `apps/dashboard/app/routes/tenant/listing-groups/_index.tsx` — title `:138`, column `:74`, meta `:27`
- Modify: `apps/dashboard/app/routes/tenant/listing-groups/review.tsx` — copy `:67,140,147-148`
- Modify: `apps/dashboard/app/routes/partner/listing-groups/new.tsx:45,48`, `edit.tsx:58`, `detail.tsx:84`
- Modify: `apps/dashboard/app/features/partner/components/listings/listing-group-lifecycle.tsx:11-35` (`GROUP_STATUS_COPY`)
- Modify: `apps/dashboard/app/features/partner/components/listings/listing-group-card.tsx:32` (fallback)
- Modify: `apps/dashboard/app/features/partner/components/listing-group-form.tsx` (submit label, field copy dùng "bài đăng")

**Interfaces:** — (chỉ chuỗi)

- [ ] **Step 1: Nav + tenant group index**

| File:line | Cũ | Mới |
|---|---|---|
| `nav.ts:45` | `'Bài đăng'` | `'Tin đăng nhiều hạng mục'` (tạm, đến khi merge) |
| `listing-groups/_index.tsx:138` | `title` "Bài đăng" | `title="Tin đăng nhiều hạng mục"` |
| `listing-groups/_index.tsx:74` | column `'Bài đăng'` | `'Tin đăng'` |
| `listing-groups/_index.tsx:27` | meta `'Bài đăng · …'` | `'Tin đăng nhiều hạng mục · …'` |

- [ ] **Step 2: Các nơi copy còn lại → "tin đăng"**

Thay "bài đăng"/"Bài đăng" → "tin đăng"/"Tin đăng" trong: `listing-groups/review.tsx:67,140,147-148` (bao gồm `entityLabel="bài đăng"` → `"tin đăng"` và "Áp dụng cho bài đăng và toàn bộ hạng mục" → "Áp dụng cho tin đăng và toàn bộ hạng mục"); `partner/listing-groups/new.tsx:45,48`, `edit.tsx:58`, `detail.tsx:84` header fallback; `GROUP_STATUS_COPY` (`listing-group-lifecycle.tsx:11-35`); form copy trong `listing-group-form.tsx` (album chung/tiện ích chung giữ "chung", nhưng "bài đăng" → "tin đăng").

- [ ] **Step 3: Bỏ fallback "Bài đăng" trên card partner**

`listing-group-card.tsx:32`: `{listingType?.name ?? 'Bài đăng'}` → `{listingType?.name ?? 'Tin đăng'}`.

- [ ] **Step 4: Verify + Commit**

```bash
pnpm turbo lint typecheck build --filter=@booking/dashboard
grep -rni "bài đăng" apps/dashboard/app
```
Expected grep: 0 kết quả "bài đăng" trong chuỗi hiển thị.
```bash
git add apps/dashboard/app/
git commit -m "refactor(dashboard): bỏ 'Bài đăng', dùng 'Tin đăng (nhiều hạng mục)'"
```

---

