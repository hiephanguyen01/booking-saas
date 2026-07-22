# Dashboard UX/UI Review — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Làm UI dashboard tự-giải-thích cho partner/tenant/admin — thống nhất thuật ngữ "Tin đăng/Loại dịch vụ", bổ sung thông tin thiếu, bỏ trùng lặp, và thêm hỗ trợ inline (description/empty-CTA/tooltip).

**Architecture:** Sửa tại chỗ trong `apps/dashboard` (React Router 8, Vietnamese-hardcoded, data qua loader/action). Thêm 1 primitive `InfoHint` vào `packages/ui` (wrap `tooltip.tsx` đã có sẵn). Chỉ 1 task chạm backend (merge queue — Đợt 4, tùy chọn). Bám spec `docs/superpowers/specs/2026-07-21-dashboard-ux-review-design.md`.

**Tech Stack:** React Router 8 (framework mode), TypeScript, Tailwind v4, shadcn primitives (`@booking/ui`), NestJS (chỉ nếu làm Task 19 full-merge).

## Global Constraints

- **KHÔNG THÊM TEST** (ADR 0005). Verify mỗi task = `pnpm turbo lint typecheck build --filter=@booking/dashboard` (+ `--filter=@booking/ui` nếu đụng ui) + mắt thường trên app đang chạy. Không tạo `*.spec.*`/`*.test.*`.
- **Node ≥ 22.22.0** — chạy `nvm use` trước mọi lệnh FE (React Router 8 từ chối Node < 22.22).
- **Không fetch backend từ browser** — data qua loader/action (`@booking/api-client`).
- **Dashboard Vietnamese-hardcoded** — sửa chuỗi trực tiếp, không thêm i18n.
- **Import `@booking/ui` qua subpath** (`@booking/ui/components/ui/<x>`), KHÔNG qua barrel (barrel chỉ export `cn`).
- **Bộ từ chuẩn (bám verbatim, xem spec Phần A):** listing đơn + post = **"Tin đăng"** · type = **"Loại dịch vụ"** · con = **itemLabel động**. CẤM: "Listing" (EN), "Bài đăng". Verb republish thống nhất = **"Đăng lại"**.
- Component shadcn mới **vào `packages/ui`**, không vào app.
- Commit thường xuyên, mỗi task 1 commit. Branch: `feat/dashboard-ux-review`.

---

## Chuẩn bị

- [ ] **Step 0.1: Tạo branch**

```bash
cd "/Volumes/OVEN Duy/temp/booking-saas"
git checkout -b feat/dashboard-ux-review
nvm use   # 22.22.0
```

- [ ] **Step 0.2: Khởi động app để kiểm mắt thường (chạy nền, giữ suốt quá trình)**

```bash
docker compose up -d
pnpm --filter=@booking/dashboard dev   # :5174
```
Đăng nhập lần lượt bằng seeded logins (admin@bookify.local / owner@studiohub.vn / giang@giangstudio.vn — mật khẩu trong AGENTS.md) để xem cả 3 persona.

---

# ĐỢT 1 — Terminology & sửa-sai (P0, mechanical, không chạm BE)

> Làm trước để "mở khoá" mặt bằng ngôn ngữ. Rủi ro thấp (đổi chuỗi hiển thị, KHÔNG đổi route path/enum value).

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

### Task 4: Làm rõ action label mập mờ ở tenant listings queue

**Files:**
- Modify: `apps/dashboard/app/routes/tenant/listings/_index.tsx:142-153`

**Interfaces:** — (chỉ nhãn nút)

- [ ] **Step 1: Đổi nhãn "Xem" → rõ nghĩa**

Nút hiện: `pending_review` → "Duyệt" (ClipboardCheck), else "Xem" (Eye) — cả hai vào `/review` (nơi có thể publish/hide). Đổi nhánh else thành `"Xem & xử lý"` (giữ icon Eye) để lộ rằng trang đích cũng để thao tác kiểm duyệt. Giữ nhánh "Duyệt" cho `pending_review`.

- [ ] **Step 2: Verify + Commit**

```bash
pnpm turbo lint typecheck build --filter=@booking/dashboard
git add apps/dashboard/app/routes/tenant/listings/_index.tsx
git commit -m "fix(dashboard): làm rõ nút 'Xem & xử lý' ở queue duyệt tin đăng"
```

---

# ĐỢT 2 — Thiếu info & giải thích quan hệ (P1)

### Task 5: Callout giải thích quan hệ Loại dịch vụ ↔ Tin đăng ↔ hạng mục

**Files:**
- Create: `apps/dashboard/app/components/relationship-hint.tsx`
- Modify: `apps/dashboard/app/routes/tenant/listings/_index.tsx` (dưới PageHeader)
- Modify: `apps/dashboard/app/routes/tenant/listing-types/_index.tsx` (dưới PageHeader)
- Modify: `apps/dashboard/app/routes/partner/listings/_index.tsx` (dưới PageHeader)

**Interfaces:**
- Produces: `export function RelationshipHint({ variant }: { variant: 'listings' | 'types' }): JSX.Element` — Alert 1 dòng, dismissible-optional (không cần state, chỉ text).

- [ ] **Step 1: Tạo component**

```tsx
// apps/dashboard/app/components/relationship-hint.tsx
import { Alert, AlertDescription } from '@booking/ui/components/ui/alert';
import { Info } from 'lucide-react';

const COPY = {
  listings:
    'Mỗi "Loại dịch vụ" định nghĩa mẫu (VD: Studio, Model). Đối tác tạo "Tin đăng" theo loại đó — một tin đăng có thể đứng riêng hoặc gồm nhiều hạng mục (phòng/gói).',
  types:
    'Loại dịch vụ là mẫu cho tin đăng: quyết định hình thức đặt, thuộc tính, và tin đăng thuộc loại này đứng riêng hay gồm nhiều hạng mục.',
} as const;

export function RelationshipHint({ variant }: { variant: keyof typeof COPY }) {
  return (
    <Alert>
      <Info className="h-4 w-4" />
      <AlertDescription>{COPY[variant]}</AlertDescription>
    </Alert>
  );
}
```

- [ ] **Step 2: Gắn vào 3 index page** (ngay sau `<PageHeader …/>`)

`tenant/listings/_index.tsx` + `partner/listings/_index.tsx`: `<RelationshipHint variant="listings" />`. `tenant/listing-types/_index.tsx`: `<RelationshipHint variant="types" />`. Import từ `~/components/relationship-hint` (theo alias hiện có của dashboard — kiểm import alias `~` ở file cùng thư mục routes).

- [ ] **Step 3: Verify + Commit**

```bash
pnpm turbo lint typecheck build --filter=@booking/dashboard
git add apps/dashboard/app/components/relationship-hint.tsx apps/dashboard/app/routes/tenant/listings/_index.tsx apps/dashboard/app/routes/tenant/listing-types/_index.tsx apps/dashboard/app/routes/partner/listings/_index.tsx
git commit -m "feat(dashboard): callout giải thích quan hệ loại dịch vụ ↔ tin đăng ↔ hạng mục"
```

---

### Task 6: Thêm cột "Loại dịch vụ" + cờ "thuộc post" vào tenant listings queue

**Files:**
- Modify: `apps/dashboard/app/routes/tenant/listings/_index.tsx` (loader + columns `:84-157`)

**Interfaces:**
- Consumes: loader đã có `ListingResponse` (fields `listingTypeId`, `groupId`). Cần map `listingTypeId → name`.
- Produces: — (thay đổi nội bộ trang)

- [ ] **Step 1: Resolve tên loại dịch vụ trong loader**

Loader hiện fetch `/tenant/partners` cho `partnerNames`. Thêm song song fetch `apiGet<Paginated<ListingTypeResponse>>('/tenant/listing-types', { pageSize: 100 })` → build `typeNames: Record<string,string>` (id→name). Dùng `Promise.all` như pattern partner fetch hiện có (không fetch tuần tự).

- [ ] **Step 2: Thêm cột**

Thêm cột "Loại" (sau cột "Đối tác"): `cell: (l) => typeNames[l.listingTypeId] ?? '—'`, `className: 'hidden md:table-cell'`. Trong cột "Tin đăng" (title), nếu `l.groupId` khác null, thêm badge nhỏ "Thuộc tin đăng nhiều hạng mục" + link tới `/tenant/listing-groups/{groupId}/review` (dùng `EntityRef`/`Link` sẵn có).

- [ ] **Step 3: Verify + Commit**

```bash
pnpm turbo lint typecheck build --filter=@booking/dashboard
# Mắt thường: queue tenant hiện cột Loại; listing con của post có badge + link về post
git add apps/dashboard/app/routes/tenant/listings/_index.tsx
git commit -m "feat(dashboard): tenant listings queue hiện Loại dịch vụ + cờ thuộc post"
```

---

### Task 7: Hiện tên Loại dịch vụ trên listing review + partner detail

**Files:**
- Modify: `apps/dashboard/app/routes/tenant/listings/review.tsx` (đã fetch type `:44-48`) + card liên quan
- Modify: `apps/dashboard/app/routes/partner/listings/detail.tsx` (card "Thông tin" `:362-383`) + loader

**Interfaces:** — (nội bộ trang)

- [ ] **Step 1: Tenant review — thêm field "Loại dịch vụ"**

`review.tsx` đã fetch `listingType` (dùng cho attributes). Thêm 1 `DetailField` "Loại dịch vụ" = `listingType?.name ?? '—'` vào card thông tin đầu tiên (VD trong `ListingContentCard` hoặc card tóm tắt) để reviewer biết "đây là Studio".

- [ ] **Step 2: Partner detail — fetch + hiện type**

`partner/listings/detail.tsx` loader hiện KHÔNG fetch type. Thêm fetch `apiGet<ListingTypeResponse>('/partner/listing-types/{listing.listingTypeId}')` (hoặc list rồi map — theo endpoint có sẵn; kiểm `packages/api-client`/contracts cho path partner listing-types). Thêm `DetailField` "Loại dịch vụ" vào card "Thông tin" (`:362-383`).

- [ ] **Step 3: Verify + Commit**

```bash
pnpm turbo lint typecheck build --filter=@booking/dashboard
git add apps/dashboard/app/routes/tenant/listings/review.tsx apps/dashboard/app/routes/partner/listings/detail.tsx
git commit -m "feat(dashboard): hiện tên Loại dịch vụ ở listing review + partner detail"
```

---

### Task 8: Hiện `structure` + `itemLabel` trên listing-types list

**Files:**
- Modify: `apps/dashboard/app/routes/tenant/listing-types/_index.tsx` (columns `:54-107`)
- Modify: `apps/dashboard/app/features/tenant/constants.ts` (thêm `STRUCTURE_LABEL`)

**Interfaces:**
- Produces: `export const STRUCTURE_LABEL: Record<'standalone'|'grouped'|'flexible', string>`

- [ ] **Step 1: Thêm nhãn structure**

```ts
// features/tenant/constants.ts
export const STRUCTURE_LABEL = {
  standalone: 'Tin đăng đơn',
  grouped: 'Nhiều hạng mục',
  flexible: 'Đối tác chọn',
} as const;
```
(Khớp wording với `listing-type-form.tsx:49-53`.)

- [ ] **Step 2: Thêm cột "Cấu trúc"**

Thêm cột (sau "Hình thức"): `cell: (t) => STRUCTURE_LABEL[t.structure] ?? '—'`. Nếu `structure !== 'standalone'`, hiện thêm `itemLabel` dạng phụ đề nhỏ: `· gọi con là "{t.itemLabel}"`. `className: 'hidden md:table-cell'`.

- [ ] **Step 3: Verify + Commit**

```bash
pnpm turbo lint typecheck build --filter=@booking/dashboard
git add apps/dashboard/app/routes/tenant/listing-types/
git commit -m "feat(dashboard): listing-types list hiện cấu trúc (đơn/nhiều hạng mục) + itemLabel"
```

---

### Task 9: Gộp 2 readout readiness của group workspace thành 1 + đồng bộ checklist

**Files:**
- Modify: `apps/dashboard/app/routes/partner/listing-groups/detail.tsx:168-188` (card "Kiểm tra")
- Modify: `apps/dashboard/app/features/partner/components/listings/listing-group-summary.tsx:69-77` (progress "Tiến độ")
- Reference: `apps/dashboard/app/features/tenant/constants.ts` (`GROUP_CHECKLIST_LABEL`, dòng 38-43)

**Interfaces:** — (nội bộ)

- [ ] **Step 1: Chọn 1 widget readiness**

Giữ card **"Kiểm tra"** (có checklist hành động rõ) làm nguồn readiness DUY NHẤT. Bỏ progress-bar "Tiến độ" trùng ở `ListingGroupOverviewCard` (`listing-group-summary.tsx:69-77`) HOẶC ngược lại — chọn một, xoá cái kia. Khuyến nghị: giữ card "Kiểm tra" (đặt lại tiêu đề "Sẵn sàng gửi duyệt"), nhúng thanh progress `{ready}/{total}` vào chính card đó.

- [ ] **Step 2: Đồng bộ nhãn checklist với tenant**

Card "Kiểm tra" đang client-compute nhãn khác `GROUP_CHECKLIST_LABEL` của tenant. Đổi 3 dòng check dùng đúng cụm từ tenant reviewer sẽ thấy (Thông tin chung / Ít nhất một {itemLabel} / Nội dung {itemLabel}) để partner & reviewer thấy cùng "danh sách sẵn sàng". Định nghĩa "đạt mức sẵn sàng" ngay tại chỗ: "(đủ ảnh, mô tả và giá)".

- [ ] **Step 3: Verify + Commit**

```bash
pnpm turbo lint typecheck build --filter=@booking/dashboard
# Mắt thường: group workspace chỉ còn 1 chỗ báo readiness, nhãn khớp trang duyệt tenant
git add apps/dashboard/app/routes/partner/listing-groups/detail.tsx apps/dashboard/app/features/partner/components/listings/listing-group-summary.tsx
git commit -m "refactor(dashboard): gộp 2 readout readiness của group workspace + đồng bộ checklist"
```

---

### Task 10: Partner listing detail — bổ sung info thiếu + link group

**Files:**
- Modify: `apps/dashboard/app/routes/partner/listings/detail.tsx` (card "Thông tin" `:362-383`, loader)

**Interfaces:** — (nội bộ)

- [ ] **Step 1: Thêm "Cập nhật" + giải thích "Khoá"**

Thêm `DetailField` "Cập nhật" (`updatedAt` qua `DateTimeValue`). Nếu listing bị admin-archive (state "Khoá" mà list hiện ở `listing-table-columns.tsx:80-91`), thêm 1 dòng cảnh báo/`WarningCallout`: "Bị quản trị viên ẩn — liên hệ tenant để mở lại."

- [ ] **Step 2: Link tới group nếu có `groupId`**

Nếu `listing.groupId`, thêm `DetailField` "Thuộc tin đăng" = link `/partner/listing-groups/{groupId}` (dùng `EntityRef`/`Link`).

- [ ] **Step 3: Verify + Commit**

```bash
pnpm turbo lint typecheck build --filter=@booking/dashboard
git add apps/dashboard/app/routes/partner/listings/detail.tsx
git commit -m "feat(dashboard): partner listing detail thêm cập nhật/khoá + link tới post"
```

---

### Task 11: Entry point tạo "Tin đăng nhiều hạng mục" từ trang partner + báo type hỗ trợ

**Files:**
- Modify: `apps/dashboard/app/routes/partner/listings/_index.tsx` (header actions `:129`, phân vùng cards/table `:146-163`)
- Modify: `apps/dashboard/app/routes/partner/listing-groups/new.tsx:11-17` (thông báo type không hỗ trợ)

**Interfaces:** — (nội bộ)

- [ ] **Step 1: Thêm heading phân vùng + nút tạo post**

Trong `partner/listings/_index.tsx`: đặt heading nhỏ trên khối group-cards ("Tin đăng nhiều hạng mục") và trên table ("Tin đăng đơn"). Cạnh nút "Thêm tin đăng" (`:129`), thêm nút phụ "Thêm tin đăng nhiều hạng mục" (dropdown hoặc nút thứ 2) dẫn tới bước chọn loại → `/partner/listing-groups/new?type=<slug>`. Nếu chưa có màn chọn loại, dẫn tới danh sách loại hỗ trợ `structure !== 'standalone'` (loader có thể trả danh sách type đủ điều kiện).

- [ ] **Step 2: `new.tsx` báo trước thay vì 404 cứng**

`new.tsx:17` khi type không hỗ trợ: thay vì throw 404, render 1 màn hướng dẫn ngắn ("Loại dịch vụ này tạo tin đăng đơn — dùng 'Thêm tin đăng'.") + link về `/partner/listings/new`.

- [ ] **Step 3: Verify + Commit**

```bash
pnpm turbo lint typecheck build --filter=@booking/dashboard
git add apps/dashboard/app/routes/partner/listings/_index.tsx apps/dashboard/app/routes/partner/listing-groups/new.tsx
git commit -m "feat(dashboard): lối tạo tin đăng nhiều hạng mục + hướng dẫn khi loại không hỗ trợ"
```

---

# ĐỢT 3 — Inline help cross-cutting (P1/P2)

### Task 12: Dựng primitive `InfoHint` (task nền)

**Files:**
- Create: `packages/ui/src/components/ui/info-hint.tsx`
- Modify: `apps/dashboard/app/root.tsx` (bọc `TooltipProvider` quanh app shell nếu chưa có)

**Interfaces:**
- Produces: `export function InfoHint({ children, label }: { children: ReactNode; label?: string }): JSX.Element` — icon `CircleHelp` là trigger, `children` là nội dung tooltip.

- [ ] **Step 1: Tạo InfoHint (wrap tooltip.tsx có sẵn)**

```tsx
// packages/ui/src/components/ui/info-hint.tsx
import type { ReactNode } from 'react';
import { CircleHelp } from 'lucide-react';
import { Tooltip, TooltipTrigger, TooltipContent } from './tooltip';

export function InfoHint({ children, label = 'Giải thích' }: { children: ReactNode; label?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" aria-label={label} className="inline-flex text-muted-foreground hover:text-foreground">
          <CircleHelp className="h-3.5 w-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-pretty">{children}</TooltipContent>
    </Tooltip>
  );
}
```

- [ ] **Step 2: Đảm bảo có `TooltipProvider` ở root**

Trong `apps/dashboard/app/root.tsx`, bọc `<TooltipProvider delayDuration={200}>` quanh nội dung app (import từ `@booking/ui/components/ui/tooltip`) nếu chưa có. Kiểm bằng grep trước khi thêm.

- [ ] **Step 3: Verify + Commit**

```bash
pnpm turbo lint typecheck build --filter=@booking/ui --filter=@booking/dashboard
git add packages/ui/src/components/ui/info-hint.tsx apps/dashboard/app/root.tsx
git commit -m "feat(ui): thêm InfoHint (tooltip) + TooltipProvider ở dashboard root"
```

---

### Task 13: Gắn InfoHint vào KPI/kế toán/status khó nghĩa

**Files:**
- Modify: `apps/dashboard/app/features/admin/components/platform-kpi-cards.tsx:35,42` (MRR/GMV)
- Modify: `apps/dashboard/app/features/admin/components/gmv-chart.tsx:132`, `tenant-health-table.tsx:30`
- Modify: `apps/dashboard/app/routes/tenant/finance/ledger.tsx:91,102` ("Nợ"/"Có")
- Modify: `apps/dashboard/app/routes/partner/revenue.tsx:267,273,285`

**Interfaces:**
- Consumes: `InfoHint` từ Task 12.

- [ ] **Step 1: Gắn hint cạnh nhãn**

Cạnh mỗi nhãn khó, thêm `<InfoHint>…</InfoHint>` với định nghĩa ngắn 1 câu. Nội dung đề xuất:
- MRR: "Doanh thu định kỳ hàng tháng từ gói thuê bao của các tenant."
- GMV: "Tổng giá trị giao dịch qua nền tảng trong kỳ (chưa trừ hoàn/hoa hồng)."
- "Nợ"/"Có": "Ghi sổ kép: Nợ và Có luôn cân bằng cho mỗi bút toán."
- "Đang giữ/chờ tranh chấp" / "Đang chờ chuyển": giải thích trạng thái tiền theo revenue.tsx.

- [ ] **Step 2: Verify + Commit**

```bash
pnpm turbo lint typecheck build --filter=@booking/dashboard
git add apps/dashboard/app/features/admin/ apps/dashboard/app/routes/tenant/finance/ledger.tsx apps/dashboard/app/routes/partner/revenue.tsx
git commit -m "feat(dashboard): InfoHint cho KPI/kế toán khó nghĩa (MRR/GMV/Nợ-Có/tiền giữ)"
```

---

### Task 14: Chuẩn hóa PageHeader description

**Files:**
- Modify: `apps/dashboard/app/routes/affiliate/_index.tsx`, `commissions.tsx:101-116`, `links.tsx:93-98` (thêm PageHeader)
- Modify: `apps/dashboard/app/routes/tenant/partners/detail.tsx:88-90`, `admin/tenants/detail.tsx:120-122`, `tenant/affiliates/detail.tsx:117-119` (description slug/email → câu giải thích)

**Interfaces:** — (chỉ props)

- [ ] **Step 1: Affiliate portal — thêm header từng tab**

Thêm `<PageHeader title=… description=… />` cho 3 tab: Tổng quan / Hoa hồng / Link giới thiệu, mỗi cái 1 câu mô tả nhiệm vụ trang.

- [ ] **Step 2: Detail pages — description hữu ích**

Giữ slug/email làm phụ (VD dưới `CopyableCode`), nhưng `description` của PageHeader đổi thành câu giải thích trang (VD partner detail: "Hồ sơ đối tác và các tin đăng, đơn đặt liên quan."). Không xoá slug — chuyển nó thành 1 field/`CopyableCode` trong nội dung.

- [ ] **Step 3: Verify + Commit**

```bash
pnpm turbo lint typecheck build --filter=@booking/dashboard
git add apps/dashboard/app/routes/affiliate/ apps/dashboard/app/routes/tenant/partners/detail.tsx apps/dashboard/app/routes/admin/tenants/detail.tsx apps/dashboard/app/routes/tenant/affiliates/detail.tsx
git commit -m "feat(dashboard): PageHeader description cho affiliate portal + detail pages"
```

---

### Task 15: Empty-state có CTA (nhánh true-empty)

**Files:** (giữ nguyên nhánh "khớp bộ lọc")
- Modify: `partner/cancellation-policies/_index.tsx:121`, `tenant|partner/promotions/_index.tsx:117,178`, `affiliate/commissions.tsx:114`, `tenant/affiliates/_index.tsx:146`, và các file empty ở spec C2.
- Modify: `admin/components/tenant-health-table.tsx:109-117`, `calendar/calendar-day-grid.tsx:33-41` (rich Empty thiếu CTA).

**Interfaces:**
- Pattern chuẩn: `Empty`+`EmptyContent` như `partner/listing-groups/detail.tsx:121-140`.

- [ ] **Step 1: Nâng các empty có action rõ ràng**

Với trang có nút tạo (cancellation-policies, promotions, affiliate links, plans): đổi `emptyMessage` trơ thành `Empty` với `EmptyContent` chứa nút CTA dẫn tới hành động tạo. Với trang thuần dữ liệu (ledger, settlements, transactions): giữ text nhưng thêm 1 câu "bắt đầu từ đâu" (VD "Bút toán sẽ xuất hiện sau đơn đặt đầu tiên.") thay vì chỉ "Chưa có … nào."

- [ ] **Step 2: Rich Empty thiếu CTA**

`tenant-health-table` + `calendar-day-grid`: thêm `EmptyContent` với hành động phù hợp (hoặc câu hướng dẫn nếu không có action).

- [ ] **Step 3: Verify + Commit**

```bash
pnpm turbo lint typecheck build --filter=@booking/dashboard
git add apps/dashboard/app/
git commit -m "feat(dashboard): empty-state có CTA/hướng dẫn bắt đầu (nhánh true-empty)"
```

---

### Task 16: Dọn EN lọt UI + raw ID + enum fallback

**Files:**
- Modify: `admin/settlements/_index.tsx:112,120`, `admin/_index.tsx:33`, `tenant/finance/settlements.tsx:173`
- Modify: `finance/balance-cards.tsx:30,43-44`, `finance/_index.tsx:194`, `booking-settlement-card.tsx:62`, `plan-table-columns.tsx:95` (Affiliate → Cộng tác viên)
- Modify: `tenant/finance/ledger.tsx:60-70,80,88`, `status-badge.tsx` (enum fallback)

**Interfaces:** — (chuỗi + fallback)

- [ ] **Step 1: Dịch EN lọt copy**

`custody` → "tiền đang giữ"; `settlement`(empty) → "khoản tiền giữ"; `refund/payout/webhook/GMV` trong `admin/_index.tsx:33` → cụm Việt (GMV giữ nhưng thêm InfoHint từ Task 13); `gateway` → "cổng thanh toán"; mọi "Affiliate" (title/label) → "Cộng tác viên".

- [ ] **Step 2: Raw UUID → code thân thiện**

`ledger.tsx` `refLabel()` + `journalId.slice(0,8)`: nếu payload có `code` thân thiện (như `booking.code`) thì dùng; nếu không, giữ slice NHƯNG bọc `title=` full id (đã có pattern). `balance-cards.tsx:30` fallback `ownerId.slice` → ưu tiên tên; nếu không có, hiển thị "(không rõ)".

- [ ] **Step 3: Enum fallback an toàn**

Các `LABEL[key] ?? key` (`status-badge.tsx:143..253`, `ledger.tsx:80,88`): đổi fallback từ `?? key` → `?? '—'` hoặc `?? 'Không xác định'` để enum mới không lộ slug thô.

- [ ] **Step 4: Verify + Commit**

```bash
pnpm turbo lint typecheck build --filter=@booking/dashboard
grep -rniE "custody|\bsettlement\b|\bgateway\b|\bAffiliate\b" apps/dashboard/app | grep -v "affiliateId\|AffiliateResponse\|/affiliate"
git add apps/dashboard/app/
git commit -m "fix(dashboard): dịch thuật ngữ EN lọt UI + fallback enum an toàn + bớt raw UUID"
```

---

# ĐỢT 4 — Cấu trúc & dọn dư thừa (P1 chạm-BE tùy chọn + P2 cleanup)

### Task 17: Dedup renderer trùng (code-cleanup, không đổi UX)

**Files:**
- Refactor: moderation-log card (`listing-content-card.tsx:52-90` vs `listing-group-summary.tsx:50-67`)
- Refactor: group content card (tenant `group-content-card.tsx` vs partner `listing-group-summary.tsx`)
- Refactor: child table vs mobile card (`grouped-listing-item.tsx:25-200`)
- Refactor: cancellation-policy renderer (detail / list column / review card)

**Interfaces:**
- Produces: các component dùng chung, VD `packages/ui/components/detail` hoặc `apps/dashboard/app/components/` (moderation-log, effective-policy).

- [ ] **Step 1: Trích component dùng chung**

Với mỗi cặp trùng, trích 1 component chung (ưu tiên `app/components/` nếu chỉ dashboard dùng). Giữ output UI y hệt (đây là refactor thuần). Ví dụ `ModerationLogGrid`, `EffectivePolicyBlock`.

- [ ] **Step 2: Thay các call-site + xóa code trùng**

- [ ] **Step 3: Verify + Commit**

```bash
pnpm turbo lint typecheck build --filter=@booking/dashboard
# Mắt thường: các trang trên trông y hệt trước refactor
git add apps/dashboard/app/ packages/ui/src/
git commit -m "refactor(dashboard): dedup moderation-log/group-content/child/cancellation renderers"
```

---

### Task 18 (TÙY CHỌN — cần bạn chốt): Merge 2 queue tenant → 1 "Tin đăng"

> ⚠️ Mục **duy nhất chạm backend**. Chỉ làm nếu bạn chọn "full merge". Nếu chọn "bước đệm" → làm Task 18b thay thế.

**Files (full merge):**
- Modify (BE): endpoint `/tenant/listing-groups` list — thêm status-counts + owner name (module `listing`, giữ hexagonal/no-service/1-use-case-file)
- Modify (FE): gộp `tenant/listings/_index.tsx` + `tenant/listing-groups/_index.tsx` → 1 route "Tin đăng"; xoá nav item thừa (`tenant/nav.ts`)

**Interfaces:**
- Produces: row type phân biệt `{ kind: 'listing' | 'post', … }`; payload `PaginatedWithCounts` cho cả 2 loại; owner đã resolve.

- [ ] **Step 1: BE — groups list trả counts + owner**

Trong use-case list groups của module `listing`: bổ sung status-counts (theo `status`) + owner (partner name). KHÔNG tạo service class; sửa trong use-case + repository-port hiện có. Cập nhật contract zod ở `packages/contracts` cho response mới. Verify `pnpm --filter=@booking/api typecheck` + `check:rls` không đổi.

- [ ] **Step 2: FE — route hợp nhất**

Tạo route "Tin đăng" hiển thị 1 bảng với discriminated rows: listing đơn (navigate → `/tenant/listings/:id/review`) và post (navigate → `/tenant/listing-groups/:id/review`). Dùng **navigate-only** cho cả hai (bỏ inline action ở group để hết lệch label). Cột chung: Tên · Đối tác · Loại · Giá từ · Trạng thái · Cập nhật; cột riêng ẩn theo kind. Status tabs + counts dùng chung. Cập nhật `tenant/nav.ts` còn 1 item "Tin đăng".

- [ ] **Step 3: Verify + Commit**

```bash
nvm use
pnpm turbo lint typecheck build --filter=@booking/dashboard
pnpm --filter=@booking/api typecheck && pnpm --filter=@booking/api check:rls
# Mắt thường: 1 queue "Tin đăng" duyệt cả listing đơn + post, có tab status + counts
git add apps/dashboard/app/ apps/api/src/modules/listing/ packages/contracts/
git commit -m "feat: gộp queue duyệt tenant thành 1 'Tin đăng' (listing đơn + post)"
```

---

### Task 18b (thay thế nếu chọn "bước đệm" — KHÔNG chạm BE)

**Files:**
- Modify: `apps/dashboard/app/routes/tenant/listing-groups/_index.tsx`

- [ ] **Step 1: Bổ sung cho group queue để đối xứng listings queue**

Thêm cột "Đối tác" (resolve từ `/tenant/partners` như listings queue), cột "{listingCount} hạng mục", cột "Hình thức". Thêm `StatusFilterTabs`: vì loader hiện `Paginated` không có counts, dùng đếm client-side từ trang hiện tại HOẶC thêm tabs không-count (link filter theo `?status=`) — không đụng BE. Ghi rõ hạn chế "counts không toàn cục" bằng `log`/comment.

- [ ] **Step 2: Verify + Commit**

```bash
pnpm turbo lint typecheck build --filter=@booking/dashboard
git add apps/dashboard/app/routes/tenant/listing-groups/_index.tsx
git commit -m "feat(dashboard): group queue thêm đối tác/số hạng mục/hình thức + lọc status (bước đệm)"
```

---

## Self-Review (đã chạy khi viết plan)

- **Spec coverage:** A1/A2 → Task 2,3; A3 → Task 1. B0-relationship → Task 5. B0-merge → Task 18/18b. B1 → Task 2,4,6. B3/B7 type name → Task 7. B5 structure → Task 8. B8 readiness → Task 9. B7 detail → Task 10. B6/B9 entry point → Task 11. C1 → Task 14. C2 → Task 15. C3 → Task 16. C4 → Task 12,13. Dedup (B3/B4/B7/B8 🟢) → Task 17. ✅ Mọi mục có task.
- **Placeholder scan:** không có TBD/TODO; các task rename có bảng chuỗi cụ thể; task code có code thật.
- **Type consistency:** `RelationshipHint({variant})`, `InfoHint({children,label})`, `STRUCTURE_LABEL` — tên dùng nhất quán giữa nơi định nghĩa và nơi tiêu thụ.
- **Ghi chú ràng buộc:** mọi task verify không-test theo Global Constraints; Task 18 là mục duy nhất chạm BE và tùy chọn.
