### Task 1: Sửa 2 lỗi thuật ngữ **sai nghĩa** (ưu tiên cao nhất)

**Files:**
- Modify: `apps/dashboard/app/features/tenant/constants.ts` (map `SEARCH_SCHEDULE_LABEL`, dòng 52-57)
- Modify: `apps/dashboard/app/routes/tenant/listing-groups/_index.tsx:201` (verb "Mở lại")
- Modify: `apps/dashboard/app/features/partner/components/listings/listing-row-actions.tsx:63` + `listing-group-lifecycle.tsx:108` (verb "Đăng lại")

**Interfaces:** — (không đổi API/type; chỉ chuỗi hiển thị)

- [ ] **Step 1: Sửa `SEARCH_SCHEDULE_LABEL` đảo nghĩa**

`schedule` **chính là một booking mode** (helper text: "Chỉ các hình thức đặt đã bật mới dùng làm lịch tìm kiếm"), nên nhãn phải khớp y hệt `BOOKING_MODE_LABEL` (`apps/dashboard/app/constants/booking.ts:14-18`). Đổi `SEARCH_SCHEDULE_LABEL` (`features/tenant/constants.ts:52-57`) thành **chính xác**:

```ts
export const SEARCH_SCHEDULE_LABEL: Record<ListingTypeSearchSchedule, string> = {
  none: 'Không dùng lịch',
  hourly: 'Theo giờ',      // was 'Theo ngày' (sai — trùng nghĩa daily)
  daily: 'Theo ngày',      // was 'Theo khoảng ngày'
  inventory: 'Theo kho',   // was 'Theo khoảng thuê kho'
};
```
Sau fix: trên listing-types list, cột "Hình thức" và cột "Tìm kiếm" của cùng 1 type đọc nhất quán (hourly → "Theo giờ" ở cả hai).

- [ ] **Step 2: Thống nhất verb republish = "Đăng lại"**

Trong `listing-groups/_index.tsx:201` đổi nhãn nút `"Mở lại"` → `"Đăng lại"`. Kiểm `listing-row-actions.tsx:63` và `listing-group-lifecycle.tsx:108` đã là "Đăng lại" (giữ). Đảm bảo intent/query param KHÔNG đổi — chỉ đổi text.

- [ ] **Step 3: Verify**

```bash
pnpm turbo lint typecheck build --filter=@booking/dashboard
```
Mắt thường: trang `tenant/listing-types` cột "Tìm kiếm" hiển thị nhãn khớp booking mode; trang `tenant/listing-groups` nút giờ là "Đăng lại".

- [ ] **Step 4: Commit**

```bash
git add apps/dashboard/app/routes/tenant/listing-types/constants.ts apps/dashboard/app/routes/tenant/listing-groups/_index.tsx apps/dashboard/app/features/partner/components/listings/listing-row-actions.tsx apps/dashboard/app/features/partner/components/listings/listing-group-lifecycle.tsx
git commit -m "fix(dashboard): sửa nhãn search-schedule đảo nghĩa + thống nhất verb 'Đăng lại'"
```

---

