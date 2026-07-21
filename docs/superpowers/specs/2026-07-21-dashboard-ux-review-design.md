# Dashboard UX/UI Review — làm UI tự-giải-thích

> **Trọng tâm:** khu **Tin đăng / Loại dịch vụ** (listing / listing-group / listing-type).
> **Mục tiêu:** mọi persona (partner / tenant / admin) **chỉ cần nhìn UI là hiểu cách xài**, không lú lẫn —
> bỏ trùng lặp, bổ sung thông tin thiếu, thống nhất thuật ngữ, thêm cơ chế hỗ trợ inline.
>
> Ngày: 2026-07-21 · App: `apps/dashboard` · Branch gợi ý: `feat/dashboard-ux-review`
> Đây là **spec review (audit + plan sửa)** — findings bên dưới đều bám `file:line` thật trong code.

---

## 0. Quyết định nền đã chốt

| Hạng mục | Chốt |
|---|---|
| **Deliverable** | Audit findings (có ưu tiên) + plan sửa. Có **điểm dừng duyệt** trước khi code. |
| **Thuật ngữ** | Thống nhất **toàn bộ**: `"Tin đăng"` = ô chung cho listing đơn lẻ **và** post nhiều hạng mục · `"Loại dịch vụ"` = listing type · con trong post gọi theo **itemLabel động** (phòng/gói/hạng mục). **Bỏ hẳn** `"Bài đăng"` và `"Listing"` (tiếng Anh). Tenant **gộp 2 queue duyệt** ("Listing" + "Bài đăng") → **1 queue "Tin đăng"**. |
| **Mức hỗ trợ** | **Inline nhẹ**: tooltip trên label/status/KPI khó, empty-state có CTA "bắt đầu từ đâu", description đủ trên mọi trang, inline hint cho field. **Không** làm product tour. |
| **Phạm vi** | Đào sâu listing/group/type (Phần B). Các khu khác quét cross-cutting terminology + inline-help (Phần C). |

**Bối cảnh kỹ thuật ràng buộc mọi fix:**
- Dashboard **Vietnamese-hardcoded** (không qua `@booking/i18n`) — sửa chuỗi = sửa trực tiếp trong route/feature/constants.
- `PageHeader` (`app/components/page-header.tsx:3-8`) **đã có** prop `description` — thiếu = trang không truyền, chứ không phải thiếu cơ chế.
- Status label đã tập trung tốt ở `app/components/status-badge.tsx` — đây là hình mẫu để noi theo.
- **Toàn app hiện có ZERO tooltip** (`grep Tooltip` → 0; `HelpCircle`/`CircleHelp` → 0). Cơ chế hint duy nhất là HTML `title=` — dùng gần như chỉ để đặt tên nút icon. ⇒ "thêm tooltip" đồng nghĩa **phải dựng 1 primitive mới** (xem Phần C → C4).
- Storefront **không phơi bày từ cố định** nào cho khách (chỉ hiện tên *loại* + itemLabel động) ⇒ dashboard tự do chọn bộ từ, miễn nhất quán (`TONG-QUAN.md:461`: nhóm là "post" thuần lớp hiển thị+kiểm duyệt; khách đặt **child listing**, không đặt "post").

---

## Phần A — Bộ từ chuẩn (canonical glossary)

Mọi fix về sau **bám bảng này**. Đây là "một nguồn sự thật" cho ngôn ngữ UI.

### A1. Từ chuẩn

| Khái niệm (entity) | ✅ Từ chuẩn | Ghi chú |
|---|---|---|
| Listing type | **Loại dịch vụ** | Giữ nguyên — đã rõ, khớp spec "service category". |
| Đơn vị đăng bán khách duyệt/đặt (standalone listing **hoặc** group/post) | **Tin đăng** | Ô chung. Partner đã làm đúng model này (1 trang "Tin đăng" = listing đơn + post card). |
| Post nhiều hạng mục (khi cần phân biệt với listing đơn) | **Tin đăng nhiều hạng mục** / "post" | Không dùng riêng từ "Bài đăng". Khi hiển thị số con: `"{n} {itemLabel}"`. |
| Con bên trong 1 post | **itemLabel động** (phòng/gói/sân/… mặc định "hạng mục") | Đã có cơ chế; giữ. |

### A2. Từ CẤM (phải thay hết) + chỗ xuất hiện

| ❌ Từ cấm | Nghĩa hiện tại | Thay bằng | Chỗ đổi (file:line) |
|---|---|---|---|
| `"Listing"` (EN) | listing đơn (tenant) | **Tin đăng** | nav `routes/tenant/nav.ts:39`; title `routes/tenant/listings/_index.tsx:162`; column `_index.tsx:86`; meta `_index.tsx:31`; empty `_index.tsx:187`; body copy review `routes/tenant/listings/review.tsx:63,77,118,128-129`; listing-types "N listing" `routes/tenant/listing-types/_index.tsx:96-99,177`; partner detail copy `routes/partner/listings/detail.tsx:390-391` |
| `"Bài đăng"` | group/post | **Tin đăng** (+ "nhiều hạng mục" khi cần) | nav `routes/tenant/nav.ts:45`; title/column `routes/tenant/listing-groups/_index.tsx:74,138`; partner `new.tsx:45,48`, `edit.tsx:58`, `detail.tsx:84`; lifecycle `listing-group-lifecycle.tsx:11-35`; card fallback `listing-group-card.tsx:32`; group-form `listing-group-form.tsx` |

> **Thứ tự quan trọng — tránh 2 nav item trùng tên:** nếu **chưa** merge queue (Đợt 4.1), tenant vẫn còn 2 trang riêng ⇒ không được đặt cả hai là "Tin đăng". Tạm thời: trang listing đơn = **"Tin đăng"**, trang group = **"Tin đăng nhiều hạng mục"**. Sau khi merge xong, còn **1** item `Tin đăng` duy nhất. Nav tenant khu **Danh mục** đích đến = `Tin đăng` · `Loại dịch vụ`. Nav partner khu **Vận hành** giữ `Tin đăng`.

### A3. Lỗi thuật ngữ **sai nghĩa** (ưu tiên cao — gây hiểu nhầm dữ liệu)

- **`SEARCH_SCHEDULE_LABEL` đảo nghĩa booking-mode** (`app/routes/tenant/.../constants.ts:52-56` vs `constants/booking.ts:14-15`): cột "Tìm kiếm" map `hourly → "Theo ngày"`, `daily → "Theo khoảng ngày"`, trong khi `BOOKING_MODE_LABEL` map `hourly → "Theo giờ"`, `daily → "Theo ngày"`. ⇒ chuỗi **"Theo ngày" nghĩa là *hourly*** ở cột search nhưng *daily* ở booking mode. **Phải sửa** (fix nhãn, không đổi logic).
- **Verb republish không nhất quán:** `"Mở lại"` (`listing-groups/_index.tsx:201`) vs `"Đăng lại"` (`listing-row-actions.tsx:63`, `listing-group-lifecycle.tsx:108`) — cùng 1 intent. Chốt **một** verb.

---

## Phần B — Findings trọng tâm: Tin đăng / Loại dịch vụ

Ký hiệu: 🔴 gây lú · 🟡 thiếu info · 🟢 dư thừa/trùng.

### B0. Vấn đề trung tâm — 3 từ cho "một listing", split theo persona & theo cấp entity
Cùng entity `ListingResponse` bị gọi **"Listing"** (tenant) và **"Tin đăng"** (partner); **"Bài đăng"** = group ở cả hai bên. Tenant thấy 2 nav item "Listing" và "Bài đăng" cạnh nhau (`nav.ts:39,45`) **không có mô tả** (`nav.ts:36` chỉ `label:'Danh mục'`) → không biết cái nào là listing đơn, cái nào là nhóm-của-listing. Quan hệ **type ↔ post ↔ listing chưa hề được giải thích trong UI**.

### B0-merge. Gộp 2 queue duyệt của tenant → 1 queue "Tin đăng" *(P1, chạm backend)*
Hai trang `tenant/listings/_index.tsx` và `tenant/listing-groups/_index.tsx` cùng quyền (`tenant.listings.read`, gate action `tenant.listings.publish`) nhưng duyệt **2 cấp entity khác nhau**, và **con của group cũng đã xuất hiện trong queue listings** (`child-listing-card.tsx:53` link về `/tenant/listings/:id/review`) → hôm nay 1 group bị duyệt ở **2 nơi, 2 vocab**. Merge cần hoà giải:

| Khác biệt | listings queue | listing-groups queue |
|---|---|---|
| Loader | `PaginatedWithCounts<ListingResponse>` + fetch `/tenant/partners` cho tên | `Paginated<ListingGroupResponse>` — **không counts, không owner** |
| Lọc status | `StatusFilterTabs` + counts (`_index.tsx:47,175-180`) | **không có** |
| Cột | Listing · Đối tác · Hình thức · Giá từ · Trạng thái · Cập nhật | Bài đăng · Địa chỉ · Giá từ · Cập nhật · Trạng thái (+ badge "Admin ẩn") |
| Row action | **navigate-only** → `/review` (route không có `action`) | **inline** publish/hide/republish (`fetcher.Form` + `action()` cùng file) |
| Route review | `/tenant/listings/:id/review` | `/tenant/listing-groups/:id/review` |

**Việc merge cần:** (a) discriminated row type (listing | post); (b) payload phân trang **kèm counts cho cả 2 loại + owner đã resolve** → **cần sửa backend** endpoint groups để trả status-counts + owner (⚠️ đây là finding duy nhất chạm API); (c) chốt 1 mô hình action (đề xuất: navigate-to-review cho cả hai để đồng nhất, bỏ inline action ở group để hết lệch label); (d) status tabs dùng chung.

> **Lựa chọn ở bước duyệt:** làm **full merge** (P1, chạm BE) *hoặc* bước đệm rẻ hơn — giữ 2 trang nhưng **bổ sung** cho group queue: status tabs + counts, cột Đối tác, cột "{n} hạng mục", cột Hình thức (để đối xứng listings queue). Ghi rõ để bạn quyết.

### B1. Tenant `listings/_index.tsx`
- 🔴 `"Listing"` (EN) ở title/column/nav/empty (`:162,86,187`, `nav.ts:39`) — xem A2.
- 🔴 Empty copy **sai ngữ cảnh**: `"Không có listing nào trong nhóm này."` (`:187`) nhưng trang này không có khái niệm "nhóm". → sửa chuỗi.
- 🔴 Action label mập mờ: `"Duyệt"` khi `pending_review` else `"Xem"` (`:142-153`) — cả hai vào cùng `/review` (nơi có thể publish/hide). "Xem" che mất việc trang đó cũng để duyệt.
- 🟡 **Thiếu cột Loại dịch vụ** — loader có `listingTypeId` mà bảng không hiện; type chỉ lộ ở trang review. Không phân biệt được Studio vs Model trong queue.
- 🟡 **Không đánh dấu listing thuộc group** — `groupId` có (`review.tsx:122-124`) nhưng index không cờ "đây là con của post X" → duyệt 2 nơi không cross-link.
- 🟢 Cột Hình thức/Giá từ/Trạng thái/Cập nhật trùng 1:1 với groups queue và partner columns.

### B2. Tenant `listing-groups/_index.tsx`
- 🔴 Title/column `"Bài đăng"` cho một *group* (`:74,138`) — xem A2/B0.
- 🔴 Inline action `Duyệt/Ẩn/Mở lại` (`:175-203`) **không nói rõ phạm vi** (áp cho cả group + toàn bộ hạng mục) và **không confirm**. Phạm vi chỉ được giải thích ở review page (`review.tsx:139-140`).
- 🔴 Badge `"Admin ẩn"` (`:120-122`) không giải thích tại chỗ (nghĩa: chỉ admin gỡ được — nằm ở `listing-group-lifecycle.tsx:62-64`).
- 🟡 **Thiếu status tabs + counts** (loader `Paginated` trần, `:34`) — moderator không lọc được "Chờ duyệt" / không thấy số pending. **Bất đối xứng lớn nhất** với listings queue.
- 🟡 **Thiếu cột Đối tác** (chủ post) và **thiếu "{n} hạng mục"** — chỉ thấy sau khi mở review.
- 🟢 ~80% bảng trùng listings queue; inline `RowActions` (`:161-208`) lặp lại publish/hide/republish vốn đã có dạng form đầy đủ ở review page (`ModerationActionsCard`).

### B3. Tenant `listings/review.tsx`
- 🔴 Trộn "listing" (EN) vào body: `:63,77,118,128-129`. Group review tương đương dùng "bài đăng" (`listing-groups/review.tsx:67,140,147-148`) — cùng action, 2 vocab.
- 🟡 **Không hiện tên Loại dịch vụ** dù đã fetch (`:44-48`) — reviewer thấy attributes mà không biết "đây là Studio".
- 🟢 `ListingModerationLogCard` (`listing-content-card.tsx:52-90`) render log publish/hide-actor trùng với group overview card (`listing-group-summary.tsx:50-67`) — 2 implementation cho cùng dữ liệu.

### B4. Tenant `listing-groups/review.tsx`
- 🔴 `itemLabel` dùng làm `CardTitle` thô (`:123`) — chuỗi partner nhập lọt thẳng làm tiêu đề section.
- 🔴 2 cách diễn đạt readiness khác nhau cùng trang: header `"{n} {itemLabel}"` (`:85`) vs child card `"{x}/{n} hạng mục đạt mức hoàn thiện cơ bản."` (`:124-126`) — "hoàn thiện cơ bản" không định nghĩa.
- 🟡 **Mất "Giá từ"** ở group review dù index có (`_index.tsx:93-100`).
- 🟢 `GroupContentCard` (tenant) trùng `ListingGroupContentCard` (partner) gần như y hệt — 2 implementation.

### B5. Tenant `listing-types/_index.tsx`
- 🔴 `"Đang dùng … N listing"` (`:96-99`) tái xuất "listing" EN trên trang "Loại dịch vụ".
- 🔴 Cột `"Tìm kiếm"` (`:76`) = search config, **trùng tên** với ô search toolbar (`:18`) — cùng chữ, 2 nghĩa/1 trang.
- 🔴 `SEARCH_SCHEDULE_LABEL` **đảo nghĩa** — xem A3 (ưu tiên cao).
- 🟡 **Thiếu cột `structure` và `itemLabel`** — không biết type nào sinh post (nhiều hạng mục) vs listing đơn — chính là thứ quyết định queue nào được populate. `structure` chỉ thấy lúc tạo (`listing-type-form.tsx:49-53`).
- 🟡 Delete disabled chỉ bằng native `title` (`:177`) — lý do ẩn dưới hover.
- 🟢 Cột "Hình thức" trùng 2 listing index.

### B6. Partner `listings/_index.tsx` (title "Tin đăng")
- 🔴 Trộn listing-đơn (table) + group (cards) **không heading phân vùng** (`:146-163`) — không biết vì sao cái là card, cái là row.
- 🔴 Card fallback `'Bài đăng'` khi thiếu type (`listing-group-card.tsx:32`) — từ thứ ba lọt lên trang "Tin đăng".
- 🔴 Thứ tự tab status lệch tenant (partner: Tất cả/Đang hiển thị/Nháp/Chờ duyệt/Đã ẩn `:101-107`; tenant: Tất cả/Chờ duyệt/Đang hiển thị/Nháp/Đã ẩn).
- 🟡 **Không có lối tạo post** từ đây — "Thêm tin đăng" (`:129`) → listing đơn; tạo group ở `/partner/listing-groups/new?type=` không có entry point hiện. Group chỉ xuất hiện khi đã tồn tại.
- 🟢 Cột table trùng tenant listings (trừ "Chính sách huỷ").

### B7. Partner `listings/detail.tsx`
- 🔴 "listing" EN trong copy precedence chính sách huỷ (`:390-391`).
- 🟡 **Thiếu info so với list**: không có "Cập nhật", không giải thích trạng thái "Khoá" (admin-lock) mà list có (`listing-table-columns.tsx:70,80-91`); **không hiện tên Loại dịch vụ**; **không link tới group** nếu có `groupId`.
- 🟢 "Chính sách huỷ" render ở 3 nơi (detail / list column / tenant review policy card) — 3 renderer cùng dữ liệu effective-policy.

### B8. Partner `listing-groups/detail.tsx` (group workspace)
- 🔴 Header fallback `'Bài đăng'` (`:84`).
- 🔴 **2 readout readiness chồng nhau**: card "Kiểm tra" (`:168-188`, client-computed) vs "Tiến độ" progress (`listing-group-summary.tsx:69-77`) — cùng tử/mẫu, 2 widget. Thêm nữa "Kiểm tra" **khác** checklist duyệt của tenant (`GROUP_CHECKLIST_LABEL`) → partner và reviewer thấy 2 danh sách "đã sẵn sàng?" khác nhau.
- 🔴 Lifecycle verb tăng sinh: "Ẩn để chỉnh sửa"/"Chuyển về bản nháp"/"Đăng lại"/"Xóa bài đăng"/"Gửi duyệt"/"Sửa thông tin chung" — phân biệt "Chuyển về bản nháp" vs "Đăng lại" không giải thích tại chỗ.
- 🟡 `GroupStatusAlert` nói action cho status hiện tại nhưng **không nói *tại sao*** (vd published: "ẩn trước khi sửa" — thiếu lý do review-lock).
- 🟢 Child table vs child mobile card render trùng ~180 dòng (`grouped-listing-item.tsx:25-200`, code tự thừa nhận "same content as a table row").

> Ghi nhận điểm sáng: `GroupStatusAlert` + card "Kiểm tra" + progress "tiến độ" là **affordance 'làm gì tiếp theo' rõ nhất app** — nhưng **chỉ tồn tại cho group**. Nên nhân rộng pattern này (rút gọn còn 1 widget) sang listing đơn.

### B9. Partner `listing-groups/new.tsx` & `edit.tsx`
- 🔴 Đều tên "Thông tin chung"/"Sửa thông tin chung" (`new.tsx:47`, `edit.tsx:59`) — không phải "tạo post"; partner có thể không nhận ra form *này chính là* post. BackLink "Bài đăng" (`new.tsx:45`) nhưng nav gọi "Tin đăng".
- 🟡 `new.tsx` 404 với type không hỗ trợ (`:17`) thay vì báo trước type nào hỗ trợ post (`structure` mà B5 không hiện).
- 🟡 `new.tsx` không set kỳ vọng luồng 2 bước (tạo vỏ → thêm hạng mục) như `edit.tsx` đã cảnh báo reset-về-nháp (`edit.tsx:78-81`).

---

## Phần C — Hỗ trợ hiểu app (inline, cross-cutting, mọi persona)

### C1. Chuẩn hóa `description` mọi trang
- **Affiliate portal thiếu hẳn header từng tab** (phá pattern toàn app): `affiliate/_index.tsx`, `affiliate/commissions.tsx:101-116`, `affiliate/links.tsx:93-98` — chỉ có header layout chung "Cộng tác viên". → thêm PageHeader + description mỗi tab.
- **Description chỉ là slug/ID/email** (nên là câu giải thích): `tenant/partners/detail.tsx:88-90` (slug), `admin/tenants/detail.tsx:120-122` (slug), `tenant/affiliates/detail.tsx:117-119` (email).

### C2. Empty-state có CTA "bắt đầu từ đâu"
Chỉ **2** empty state hiện có CTA (`admin/plans/_index.tsx:70`, `affiliate/links.tsx:121`). Pattern chuẩn để nhân rộng: `Empty` + `EmptyContent` (nút) như `partner/listing-groups/detail.tsx:121-140`.
Danh sách empty **trần, cần thêm CTA**: `affiliate/commissions.tsx:114`; `partner/revenue.tsx:385,404`; `tenant/finance/ledger.tsx:161`; `tenant/finance/settlements.tsx:228`; `finance/payouts-table.tsx:60`; `admin/settlements/_index.tsx:120`; `tenant/affiliates/_index.tsx:146`; `partner/cancellation-policies/_index.tsx:121`; `tenant|partner/promotions/_index.tsx:117,178`; `tenant/bookings/_index.tsx:200,216`; `payments/.../payment-transactions-page.tsx:134`; overview cards `payables-card.tsx:30`, `recent-bookings-card.tsx:60`.
Cũng nâng 2 rich `Empty` đang thiếu CTA: `admin/.../tenant-health-table.tsx:109-117`, `calendar/calendar-day-grid.tsx:33-41`.
> Giữ nguyên nhánh "khớp bộ lọc" (đang tốt) — chỉ thêm CTA ở nhánh **true-empty**.

### C3. Dọn thuật ngữ EN lọt UI + raw ID
- **EN lọt copy:** `custody` (`admin/settlements/_index.tsx:112`), `settlement` (empty `:120`), `refund`/`payout`/`webhook`/`GMV` (`admin/_index.tsx:33`), `gateway` (`tenant/finance/settlements.tsx:173`), `Affiliate` vs "Cộng tác viên" (`finance/balance-cards.tsx:43-44`, `finance/_index.tsx:194`, `booking-settlement-card.tsx:62`, `plan-table-columns.tsx:95`). Chốt: tenant-facing dịch hết ("Tiền đang giữ", "Cộng tác viên"…). Quyết định glossary cho "Tenant/Partner" viết hoa.
- **Raw UUID lộ ra:** ledger `journalId.slice(0,8)` + `refLabel()` slice booking/payment/payout (`tenant/finance/ledger.tsx:60-70`) — trong khi bookings hiện `booking.code` thân thiện. Balance fallback `ownerId.slice(0,8)` (`balance-cards.tsx:30`). → dùng code thân thiện chỗ có thể.
- **Enum fallback an toàn:** nhiều `LABEL[key] ?? key` (`status-badge.tsx:143..253`, `ledger.tsx:80,88`) — nếu BE thêm enum mới, key thô lộ cho operator. → fallback về nhãn generic thay vì key.

### C4. Cơ chế tooltip/hint (prerequisite — app đang ZERO tooltip)
Thêm **1 primitive nhẹ** vào `packages/ui` (shadcn Tooltip → wrap thành `InfoHint` = icon `CircleHelp` + nội dung). Đây là **task nền** cho mọi hint. Dùng cho: KPI/kế toán khó nghĩa — MRR/GMV (`platform-kpi-cards.tsx:35,42`, `gmv-chart.tsx:132`, `tenant-health-table.tsx:30`), "Nợ"/"Có" double-entry (`ledger.tsx:91,102`), "Tổng ghi có"/"Đang giữ"/"Đang chờ chuyển" (`revenue.tsx:267,273,285`), status badge nghĩa vòng đời, "Admin ẩn", precedence chính sách huỷ. Và inline hint cho field form còn trống mô tả.

---

## Phần D — Ưu tiên & phân đợt

Mỗi finding: **Mức** (P0 lú nặng/rẻ → P2 nice-to-have) · **Effort** (S/M/L) · **Persona**.

### Đợt 1 — Terminology & sửa-sai (P0, chủ yếu mechanical, không chạm BE)
| # | Việc | Effort | Persona |
|---|---|---|---|
| 1.1 | Áp bộ từ chuẩn A1/A2: thay hết "Listing"(EN) + "Bài đăng" → "Tin đăng"; sửa nav/title/column/meta/empty/body copy. Nếu chưa merge (4.1): trang group tạm dùng "Tin đăng nhiều hạng mục" để không trùng nav | M | tenant, partner |
| 1.2 | Sửa `SEARCH_SCHEDULE_LABEL` đảo nghĩa (A3) | S | tenant |
| 1.3 | Thống nhất verb republish (A3) | S | tenant, partner |
| 1.4 | Sửa empty copy sai ngữ cảnh `listings/_index.tsx:187` | S | tenant |
| 1.5 | Làm rõ action label "Xem"/"Duyệt" (B1) | S | tenant |
| 1.6 | Bỏ fallback "Bài đăng" trên card partner (B6) | S | partner |

### Đợt 2 — Thiếu info & giải thích quan hệ (P1)
| # | Việc | Effort | Persona |
|---|---|---|---|
| 2.1 | Thêm cột **Loại dịch vụ** + cờ "thuộc post" (cross-link) vào tenant listings queue (B1) | M | tenant |
| 2.2 | Hiện **tên Loại dịch vụ** trên listing review + partner detail (B3,B7) | S | tenant, partner |
| 2.3 | Hiện **structure + itemLabel** trên listing-types list (B5) | S | tenant |
| 2.4 | Group workspace: **gộp 2 readout readiness → 1**, đồng bộ checklist partner ↔ tenant (B8) | M | partner |
| 2.5 | Partner detail: thêm "Cập nhật", giải thích "Khoá", link tới group nếu có (B7) | M | partner |
| 2.6 | Entry point tạo post từ trang "Tin đăng" partner + báo trước type hỗ trợ (B6,B9) | M | partner |
| 2.7 | Callout ngắn giải thích **type ↔ post ↔ listing** ở index liên quan (B0) | S | tenant, partner |

### Đợt 3 — Inline help cross-cutting (P1/P2)
| # | Việc | Effort | Persona |
|---|---|---|---|
| 3.1 | Dựng primitive `InfoHint` (C4) — **task nền** | M | all |
| 3.2 | Chuẩn hóa PageHeader description (affiliate portal + slug-as-desc) (C1) | M | all |
| 3.3 | Empty-state CTA pass (C2) | M | all |
| 3.4 | Dọn EN lọt UI + raw ID + enum fallback (C3) | M | admin, tenant, partner |
| 3.5 | Gắn InfoHint vào KPI/kế toán/status khó (C4) | M | admin, tenant, partner |

### Đợt 4 — Cấu trúc & dọn dư thừa (P1 có 1 mục chạm BE + P2 code-cleanup)
| # | Việc | Effort | Persona |
|---|---|---|---|
| 4.1 | **Merge 2 queue tenant → "Tin đăng"** (B0-merge) — ⚠️ chạm BE (groups endpoint cần counts+owner). *Hoặc* bước đệm: thêm status tabs/counts/owner/item-count cho group queue | **L** | tenant |
| 4.2 | Dedup renderer trùng: moderation-log card, group content card, child table/mobile card, cancellation-policy renderer (B3,B4,B7,B8) | M | — (cleanup) |

---

## Nguyên tắc thực thi (mọi đợt phải theo)

- **Không thêm test** (ADR 0005). Verify = `pnpm turbo lint typecheck build` + chạy app. Node ≥ 22.22.0 (`nvm use`) nếu FE build lỗi ngay.
- **Không fetch từ browser** — mọi data qua loader/action (`@booking/api-client`). Merge queue (4.1) nếu cần counts phải sửa **BE endpoint**, không fetch phía client.
- Tuân **filter-spec + `<ListToolbar>` + `readListFilters`** đã có (đừng phá convention list-page trong `docs/conventions.md`).
- Component shadcn mới (Tooltip) **thêm vào `packages/ui`**, không vào app (`/shadcn`).
- Dashboard **Vietnamese-hardcoded** — sửa chuỗi tại chỗ, không thêm i18n.
- Giữ **hexagonal, no service class, 1 use-case/file** nếu đợt 4.1 chạm API.
- Chạy `/security-review` nếu có thay đổi liên quan quyền/kiểm duyệt.

## Rủi ro & ghi chú
- **Đợt 1 đụng nhiều file** nhưng mechanical (rename chuỗi) — rủi ro thấp, nên làm trước để "unlock" mặt bằng ngôn ngữ cho các đợt sau.
- **4.1 (merge queue) là mục nặng & duy nhất chạm BE** — có phương án bước-đệm nếu chưa muốn động API. Cần bạn quyết ở bước duyệt.
- **A3 (SEARCH_SCHEDULE đảo nghĩa)** tuy nhỏ nhưng **sai nghĩa dữ liệu** — nên nhấc lên P0.
- Terminology rename có thể chạm `meta`/title dùng cho SEO/tab — kiểm tra không vỡ test snapshot (không có test → an toàn) và không đổi route path (chỉ đổi nhãn hiển thị).

## Ngoài phạm vi lần này
- Product tour / onboarding flow / getting-started checklist đa bước (đã chốt: chỉ inline nhẹ).
- Full audit sâu các khu ngoài listing (chỉ quét cross-cutting).
- Refactor code không phục vụ mục tiêu UX (chỉ dedup các renderer đã nêu).
