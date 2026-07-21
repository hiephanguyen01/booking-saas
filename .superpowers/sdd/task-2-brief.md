### Task 2: Rename "Listing" (EN) → "Tin đăng" phía tenant

**Files:**
- Modify: `apps/dashboard/app/routes/tenant/nav.ts:39` (nav label)
- Modify: `apps/dashboard/app/routes/tenant/listings/_index.tsx` — title `:162`, column header `:86`, meta `:31`, empty `:187`
- Modify: `apps/dashboard/app/routes/tenant/listings/review.tsx` — body copy `:63,128-129`, `entityLabel` `:118`, BackLink `:77`
- Modify: `apps/dashboard/app/routes/tenant/listing-types/_index.tsx:96-99,177` ("N listing" → "N tin đăng")

**Interfaces:** — (chỉ chuỗi)

- [ ] **Step 1: Đổi nav + title + column**

Bảng đổi (đúng token, giữ nguyên phần còn lại của chuỗi):

| File:line | Cũ | Mới |
|---|---|---|
| `nav.ts:39` | `'Listing'` | `'Tin đăng'` |
| `listings/_index.tsx:162` | `title="Listing"` | `title="Tin đăng"` |
| `listings/_index.tsx:86` | `header: 'Listing'` | `header: 'Tin đăng'` |
| `listings/_index.tsx:31` | `'Listing · Tenant · Bookify'` | `'Tin đăng · Tenant · Bookify'` |
| `listings/_index.tsx:187` | `'Không có listing nào trong nhóm này.'` | `'Không có tin đăng nào khớp bộ lọc.'` |

> ⚠️ Vì Task 19 (merge) có thể chưa làm, để tránh **2 nav item cùng tên**: ở Task 3 trang group sẽ đặt tên tạm "Tin đăng nhiều hạng mục". Giữ item listing đơn = "Tin đăng".

- [ ] **Step 2: Đổi body copy trong review.tsx**

Thay mọi chữ "Listing"/"listing" (EN) trong chuỗi tiếng Việt của `review.tsx` thành "Tin đăng"/"tin đăng": contact-leak `:63`, publish desc `:128-129`, `entityLabel="listing"` → `entityLabel="tin đăng"` `:118`, BackLink `"Danh sách listing"` → `"Danh sách tin đăng"` `:77`.

- [ ] **Step 3: Đổi "N listing" ở listing-types**

`listing-types/_index.tsx:96-99` cột "Đang dùng": `"{listingCount} listing"` → `"{listingCount} tin đăng"`. `:177` tooltip delete: `'Đang được {n} listing sử dụng — không thể xoá.'` → `'Đang được {n} tin đăng sử dụng — không thể xoá.'`

- [ ] **Step 4: Verify + Commit**

```bash
pnpm turbo lint typecheck build --filter=@booking/dashboard
grep -rn "Listing\b\|listing nào\| listing " apps/dashboard/app/routes/tenant/listings apps/dashboard/app/routes/tenant/listing-types apps/dashboard/app/routes/tenant/nav.ts
```
Expected grep: không còn "Listing" EN trong chuỗi hiển thị tiếng Việt (biến/type tên `Listing`/`ListingResponse` giữ nguyên — chỉ đổi chuỗi UI).
```bash
git add apps/dashboard/app/routes/tenant/
git commit -m "refactor(dashboard): tenant dùng 'Tin đăng' thay 'Listing' (EN)"
```

---

