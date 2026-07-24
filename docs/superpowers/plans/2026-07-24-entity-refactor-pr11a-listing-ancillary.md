# PR #11a — CancellationPolicy + PricingRule + Resource (listing, aggregate phụ) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mảnh tự-chứa nhất của module listing (module lớn nhất, tách 3 PR con): 3 aggregate phụ
`CancellationPolicy`, `PricingRule`, `Resource`. Lập pattern + error file dùng chung cho #11b (Listing)
và #11c (ListingGroup). Wire byte-identical (một ngoại lệ envelope-normalization vô hình với consumer,
xem dưới).

**Phạm vi module listing (chốt owner 2026-07-24 — 3 PR con):**
- **#11a (bản này)** — CancellationPolicy + PricingRule + Resource.
- **#11b** — Listing (content CRUD + moderation standalone + deposit + group-binding).
- **#11c** — ListingGroup + cascade moderation.

**Architecture:** Theo spec
[`2026-07-23-api-entity-centric-refactor-design.md`](../specs/2026-07-23-api-entity-centric-refactor-design.md)
§3 + style-gate. Pattern như PR #2/#4/#9: use-case làm I/O, truyền dữ kiện đã resolve vào entity.

## Global Constraints

- **KHÔNG test** (ADR 0005); verify = `typecheck` + `lint` + `build` + chạy app.
- **ADR 0006**: không service class; 1 use-case = 1 file, 1 `execute()`.
- Node **22.22.0** (`nvm use`), chỉ **pnpm**; smoke `PORT=3001` nếu 3000 bận; không đụng
  container/process project khác.
- Branch **`refactor/entity-listing-ancillary`** (đã tạo, base `1d07abc`), PR vào
  `refactor/entity-centric`. **Mọi commit trên nhánh feature** — PR #25 đang mở trên nhánh tích hợp.

### ✅ Ngoại lệ envelope duy nhất — chuẩn-hóa `statusCode` (vô hình với consumer)

Các throw ở **partner-path pricing-rule** hiện bỏ key `statusCode` trong body (chỉ `{code, message}`),
trong khi tenant-path có đủ `{statusCode, code, message}` — drift có sẵn, ngay trong cùng file
`create-partner-pricing-rule.use-case.ts`. `DomainExceptionFilter` **luôn** phát `statusCode`, nên
chuyển sang domain error sẽ **thêm** `statusCode` vào ~5 body partner-path.

**An toàn, không cần duyệt riêng**: `@booking/api-client` (`packages/api-client/src/errors.ts:65-66`,
`client.ts:128`) chỉ đọc `body.message/error/code` + HTTP **status line** — **không đọc
`body.statusCode`**. HTTP status line không đổi. Nên thêm field này **vô hình với consumer duy nhất**,
và làm partner-path **khớp đúng envelope tài liệu** `{statusCode, code, message, details?}`
(`docs/conventions.md`). Ghi vào PR body + §8a như envelope-normalization có chủ đích.

### Wire đóng băng — giữ từng ký tự (code + message + status line + envelope, trừ ngoại lệ trên)

| code | status | message | nơi phát |
|---|---|---|---|
| `CANCELLATION_POLICY_NOT_FOUND` | 404 | `Cancellation policy not found` | update/delete/get (partner + tenant) |
| `CANCELLATION_POLICY_NOT_OWNED` | 403 | `You can only edit your own cancellation policies` (update) / `…delete your own…` (delete) — **2 message khác** | update/delete-cancellation-policy |
| `CANCELLATION_POLICY_NOT_TENANT_OWNED` | 403 | `Only tenant-owned cancellation policies can be edited here` (update) / `…deleted here` (delete) — **2 message khác** | update/delete-tenant |
| `CANCELLATION_POLICY_IN_USE` | 409 | `` Cannot delete a policy still attached to ${inUse} listing(s); reassign them first `` | delete + delete-tenant (message **giống hệt**) |
| `LISTING_NOT_FOUND` | 404 | `Listing not found` | pricing-rule (tenant có statusCode; partner thiếu → chuẩn hóa) |
| `LISTING_NOT_OWNED` | 403 | `This listing belongs to another partner` | pricing-rule partner (thiếu statusCode → chuẩn hóa) |
| `MODE_NOT_ENABLED` | 400 | `` Listing does not enable "${bookingMode}" `` | pricing-rule create (partner thiếu statusCode → chuẩn hóa) |
| `PACKAGE_PRICING_FIXED` | 400 | `Fixed-package prices are managed in the listing package configuration` | pricing-rule create (cả 2 có statusCode) |
| `PRICING_RULE_NOT_FOUND` | 404 | `Pricing rule not found` | delete pricing-rule (tenant có statusCode; partner thiếu → chuẩn hóa) |
| `PRICING_RULE_OVERLAP` | 400 | `` Pricing window overlaps ${from}–${to} `` (dấu `–` là en-dash U+2013) | create-partner-pricing-rule |

### ⛔ Bề mặt đóng băng xuyên module (booking + scheduling đọc)

- **`IPricingRuleRepository.listByListing(tx, listingId)`** — booking `create-booking` + scheduling
  `get-availability` gọi. **Không đổi chữ ký, không đổi shape `PricingRuleRecord`.**
- **`IResourceRepository.findById(tx, id)`** — booking + scheduling gọi. **Không đổi.**
- `CANCELLATION_POLICY_REPOSITORY` **không được export** khỏi module (0 consumer ngoài) → tự do đổi
  nội bộ. Nhưng vẫn giữ `CancellationPolicyRecord` shape để read use-case + mapper không đổi.
- **KHÔNG đụng** `resolveEffectivePolicy` (fallback 3 tầng) trong `prisma-listing.repository.ts` —
  read-side, thuộc aggregate Listing (#11b); booking refund đọc `effectiveCancellationPolicy`.

### ⛔ Known gap — GIỮ NGUYÊN, ghi sổ (§8a)

1. **Overlap check chỉ ở partner-path**; `create-pricing-rule` (tenant) **không** có overlap check
   lẫn replace-semantics ⇒ tenant staff tạo được window chồng nhau. Không có DB constraint. Giữ nguyên.
2. **`pricing_rule.deleted` có 2 payload khác nhau**: tenant `{pricingRuleId}`, partner
   `{pricingRuleId, listingId}`. Giữ đúng cả hai (dù event này 0 consumer).
3. **`create-resource` không kiểm `partnerId` thuộc tenant** — bất kỳ caller có quyền
   `tenant.listings.write` tạo được resource cho partnerId bất kỳ. Giữ nguyên.
4. **PricingRule không có method `update`** — "update" = delete-then-create, chỉ ở partner-path.
   Giữ nguyên (không thêm `update` vào port).
5. **`findPartnerDefaultId`/`findTenantDefaultId` đọc cột `partner`/`tenant`** (không phải bảng
   policy) — con trỏ "isDefault" thuộc partner/tenant, entity CancellationPolicy **không** sở hữu.
   Giữ là repo read.
6. **Slug/uniqueness không áp dụng** cho 3 aggregate này (không có slug). P2002 không phát sinh ở
   đây (không có unique nào ngoài PK).

### Đóng băng khác

- **Money**: `price`/`salePrice` là digit string ở tầng app; `BigInt()` **chỉ** ở repo write,
  `.toString()` **chỉ** ở repo read. PricingRule entity **không làm toán tiền** (chỉ validate
  mode/type/overlap trên `params`) ⇒ `New*` payload giữ `price: string` như `CreatePricingRuleData`,
  **không** đổi sang bigint (tránh round-trip thừa; spec bigint-rule chỉ áp cho entity làm toán tiền).
- **Clock**: `create-resource` timezone fallback đọc tenant qua `resolveTenantTimezone` (I/O) — giữ ở
  use-case. Không có clock nào khác trong 3 aggregate này.
- Mọi use-case chạy trong `forTenant` — giữ nguyên (repo dựa GUC để scope tenant; đừng đổi).
- Read-side đóng băng: list/get use-case, mapper, controller (kể cả thứ tự route).
- Domain framework-free: chỉ `import type` từ `@booking/contracts` + domain nội bộ.

---

### Task 1: Domain errors

**Files:**
- Create `apps/api/src/modules/listing/domain/errors/listing-errors.ts` — **shared, #11b/#11c dùng lại**:
  `ListingNotFound`, `ListingNotOwned`.
- Create `apps/api/src/modules/listing/domain/errors/cancellation-policy-errors.ts`:
  `CancellationPolicyNotFound`, `CancellationPolicyNotOwnedForEdit`, `CancellationPolicyNotOwnedForDelete`,
  `CancellationPolicyNotTenantOwnedForEdit`, `CancellationPolicyNotTenantOwnedForDelete`,
  `CancellationPolicyInUse(count)`.
- Create `apps/api/src/modules/listing/domain/errors/pricing-rule-errors.ts`:
  `ModeNotEnabled(mode)`, `PackagePricingFixed`, `PricingRuleNotFound`, `PricingRuleOverlap(from, to)`.

**Ghi chú:** `CANCELLATION_POLICY_NOT_OWNED` và `_NOT_TENANT_OWNED` mỗi cái có **hai message khác nhau**
(edit vs delete) — tách thành hai class riêng để giữ đúng từng byte (giống cách
`DomainNotFoundForTenant`/`DomainNotFound` của tenancy). `PRICING_RULE_OVERLAP` message có en-dash
`–` (U+2013), copy đúng ký tự. Khuôn theo `domain/errors/*-errors.ts` của các module đã refactor.

- [ ] **Step 1:** Đọc 12 use-case liên quan lấy message nguyên văn; viết 3 file. **Step 2:** Typecheck
  exit 0. **Step 3:** Commit `feat(listing): domain errors cho cancellation-policy + pricing-rule + resource`.

---

### Task 2: 3 aggregate

**Files:**
- Create `domain/entities/cancellation-policy.entity.ts`
- Create `domain/entities/pricing-rule.entity.ts`
- Create `domain/entities/resource.entity.ts`

- [ ] **Step 1: `cancellation-policy.entity.ts`** — `CancellationPolicyState` (id, partnerId: string|null,
  name, rules), `NewCancellationPolicy` (partnerId, name, rules), `CancellationPolicyPatch` (name?, rules?);
  class:
  - `static rehydrate(state)`, `static open({ partnerId, name, rules }): NewCancellationPolicy`
  - `assertOwnedByPartner(partnerId)` → ném `CancellationPolicyNotOwnedForEdit` (dùng cho update)
    **và** `assertDeletableByPartner(partnerId)` → `CancellationPolicyNotOwnedForDelete` (dùng cho
    delete) — hai method vì hai message khác nhau. Tương tự
    `assertTenantOwnedForEdit()`/`assertTenantOwnedForDelete()` (ném 2 class tenant tương ứng khi
    `partnerId !== null`).
  - `assertNotInUse(inUse)` → `CancellationPolicyInUse(inUse)` khi `inUse > 0`.
  - `applyUpdate(input): CancellationPolicyPatch` — trả patch chỉ gồm key gửi (`name`/`rules`).
  Doc "NOT owned here": con trỏ default (`isDefault`) nằm ở partner/tenant, không thuộc entity.

- [ ] **Step 2: `pricing-rule.entity.ts`** — `NewPricingRule` (listingId, bookingMode, ruleType, params,
  price: string, salePrice: string|null, priority); class/hàm:
  - `static open({...}): NewPricingRule`
  - `assertAllowedOn({ bookingModes, bookingSelection })` — rule mode-enabled + not-fixed-packages:
    ném `ModeNotEnabled(bookingMode)` nếu `!bookingModes.includes(this.bookingMode)`, ném
    `PackagePricingFixed()` nếu `bookingSelection === 'fixed_packages'`. (Đây là chỗ dedup 2 bản copy.)
  - pure function `findOverlappingWindow(existing: {bookingMode, ruleType, params}[], candidate)` —
    copy **nguyên logic** overlap của partner-path (chỉ `date_time_range`, so `date`/`from`/`to`,
    loại chính nó bằng `JSON.stringify(params)`), trả về rule chồng hoặc `null`. Use-case ném
    `PricingRuleOverlap(from, to)` từ kết quả.
  - pure function `sameWindowKey(rule, candidate)` — cho replace-semantics
    (`bookingMode`+`ruleType`+`JSON.stringify(params)` bằng nhau).
  Doc: overlap/replace **chỉ** partner-path (known gap #1); không đổi.

- [ ] **Step 3: `resource.entity.ts`** — thin: `NewResource` (partnerId, name, timezone);
  `static provision({ partnerId, name, timezone }): NewResource` (passthrough; timezone đã resolve ở
  use-case). Doc: không kiểm partnerId-thuộc-tenant (known gap #3), giữ nguyên.

- [ ] **Step 4:** Typecheck exit 0. **Step 5:** Commit
  `feat(listing): CancellationPolicy + PricingRule + Resource aggregate`.

---

### Task 3: Wire cancellation-policy (6 write use-case) + port + repo

**Files:** `create/update/delete-cancellation-policy`, `create/update/delete-tenant-cancellation-policy`
use-cases; `cancellation-policy-repository.port.ts`; `prisma-cancellation-policy.repository.ts`.

- [ ] **Step 1: Port** — `create(tx, tenantId, data: NewCancellationPolicy)`,
  `update(tx, id, patch: CancellationPolicyPatch)`; bỏ `CreateCancellationPolicyData`/
  `UpdateCancellationPolicyData` (grep xác nhận 0 consumer ngoài trước khi xoá). Giữ nguyên
  `CancellationPolicyRecord`, `findById`, `listForPartner`, `listTenantLevel`, `countListingsUsing`,
  `findPartnerDefaultId`, `findTenantDefaultId`, `delete`.
- [ ] **Step 2: Repo** — chỉ đổi kiểu tham số `create`/`update`; thân giữ nguyên.
- [ ] **Step 3–4: 2 create use-case** — dùng `CancellationPolicy.open({...})`; giữ nguyên
  `findPartnerDefaultId`/`findTenantDefaultId` + map response.
- [ ] **Step 5–6: 2 update use-case** — 404 → `CancellationPolicyNotFound`; guard ownership →
  `CancellationPolicy.rehydrate(existing).assertOwnedByPartner(partnerId)` (partner) /
  `.assertTenantOwnedForEdit()` (tenant); merge → `applyUpdate(input)`.
- [ ] **Step 7–8: 2 delete use-case** — 404 → `CancellationPolicyNotFound`; ownership →
  `assertDeletableByPartner(partnerId)` / `assertTenantOwnedForDelete()`; in-use → `assertNotInUse(inUse)`
  sau `countListingsUsing`. Giữ nguyên: không outbox (cancellation-policy **không** emit event).
- [ ] **Step 9:** Typecheck + lint exit 0. **Step 10:** Commit
  `refactor(listing): cancellation-policy use-case qua aggregate`.

---

### Task 4: Wire pricing-rule (4) + resource (1) + ports/repos

**Files:** `create-pricing-rule`, `create-partner-pricing-rule`, `delete-pricing-rule`,
`delete-partner-pricing-rule`, `create-resource` use-cases; `pricing-rule-repository.port.ts`,
`resource-repository.port.ts`; 2 repo.

- [ ] **Step 1: pricing-rule port/repo** — `create(tx, tenantId, data: NewPricingRule)`; bỏ
  `CreatePricingRuleData`. **Giữ nguyên `listByListing`, `findById`, `delete`, `PricingRuleRecord`**
  (booking + scheduling đọc `listByListing`). Repo `create` thân giữ nguyên (vẫn `BigInt(data.price)`).
- [ ] **Step 2: resource port/repo** — `create(tx, tenantId, data: NewResource)`; bỏ
  `CreateResourceData`. **Giữ nguyên `findById`, `list`, `ResourceRecord`** (booking + scheduling đọc
  `findById`).
- [ ] **Step 3: `create-pricing-rule` (tenant)** — 404 → `ListingNotFound`; mode/fixed →
  `PricingRule` (dựng entity rồi `assertAllowedOn({bookingModes, bookingSelection})` từ listing đã
  load); create qua `PricingRule.open({...})`; **giữ nguyên** emit `pricing_rule.created` payload
  `{pricingRuleId, listingId}`. **KHÔNG** thêm overlap check (known gap #1).
- [ ] **Step 4: `create-partner-pricing-rule`** — 404 → `ListingNotFound`; ownership →
  `ListingNotOwned`; mode/fixed → `assertAllowedOn`; overlap → dùng `findOverlappingWindow(existing,
  candidate)` rồi ném `PricingRuleOverlap(from, to)`; replace → lặp `existing`, xoá rule mà
  `sameWindowKey(...)` (giữ nguyên delete-then-create trong tx); create qua `PricingRule.open`; giữ
  emit `pricing_rule.created` `{pricingRuleId, listingId}`.
- [ ] **Step 5: `delete-pricing-rule` (tenant)** — 404 → `PricingRuleNotFound`; giữ emit
  `pricing_rule.deleted` payload **`{pricingRuleId: id}`** (KHÔNG có listingId).
- [ ] **Step 6: `delete-partner-pricing-rule`** — 404 listing → `ListingNotFound`; ownership →
  `ListingNotOwned`; 404 rule (`!rule || rule.listingId !== listingId`) → `PricingRuleNotFound`; giữ
  emit `pricing_rule.deleted` payload **`{pricingRuleId: ruleId, listingId}`** (CÓ listingId).
- [ ] **Step 7: `create-resource`** — dùng `Resource.provision({partnerId, name, timezone})`; giữ
  nguyên resolve timezone qua `resolveTenantTimezone` và emit `resource.created` `{resourceId}`.
- [ ] **Step 8:** Typecheck + lint + build exit 0.
- [ ] **Step 9: Đối chiếu** — `git diff HEAD -- apps/api/src/modules/listing`:

  | Điểm | Kỳ vọng |
  |---|---|
  | 10 dòng wire | code/message/status y hệt; partner-path pricing nay có thêm `statusCode` (chuẩn hóa đã duyệt) |
  | 2 message khác nhau của `CANCELLATION_POLICY_NOT_OWNED`/`_NOT_TENANT_OWNED` | đều còn |
  | `pricing_rule.deleted` 2 payload | tenant `{pricingRuleId}` / partner `{pricingRuleId, listingId}` — đúng cả hai |
  | `pricing_rule.created` + `resource.created` | payload không đổi |
  | Overlap check | vẫn **chỉ** partner-path; tenant create không có |
  | `listByListing`/`findById`/record shape | không đổi (booking + scheduling đọc) |
  | Money | price/salePrice vẫn string ở app; `BigInt()` chỉ ở repo; 0 `Number()` mới |
  | Read-side + `resolveEffectivePolicy` | không đụng |

- [ ] **Step 10:** Commit `refactor(listing): pricing-rule + resource use-case qua aggregate`.

---

### Task 5: Docs + verify + smoke + PR

- [ ] **Step 1: Docs**
  - `apps/api/CLAUDE.md`: thêm `listing (cancellation-policy + pricing-rule + resource — PR #11a)`.
  - Spec §8a: thêm — (a) envelope-normalization: partner-path pricing errors thêm `statusCode` (vô
    hình với api-client, khớp envelope tài liệu); (b) overlap check chỉ partner-path; (c) `create-resource`
    không kiểm partnerId-thuộc-tenant; (d) 2 payload `pricing_rule.deleted` khác nhau (ghi nhận, giữ).
  - `docs/refactor/HANDOFF.md` §1: `| 11a | listing — cancellation/pricing/resource | 🔍 review (PR #NN) |`;
    ghi kế tiếp **PR #11b Listing** (dùng lại `listing-errors.ts` từ PR này) rồi **#11c ListingGroup**.
- [ ] **Step 2:** `pnpm turbo lint typecheck build` + `check:rls` xanh.
- [ ] **Step 3:** `docker ps`; boot API `PORT=3001`; kill khi xong.
- [ ] **Step 4: Smoke** — partner `giang@giangstudio.vn` / `demo-password` (header `x-partner-id`),
  tenant owner `owner@studiohub.vn` (header `x-tenant-id`):

  1. **Partner tạo cancellation policy** → 2xx; **update** đổi name → 2xx; **update policy của
     partner khác / tenant-level** → 403 `CANCELLATION_POLICY_NOT_OWNED` message chính xác.
  2. **Delete policy đang gắn listing** → 409 `CANCELLATION_POLICY_IN_USE` với `${inUse}` đúng số;
     delete policy chưa gắn → 2xx.
  3. **Tenant update một policy của partner** → 403 `CANCELLATION_POLICY_NOT_TENANT_OWNED` (message
     "edited here"); tenant delete tương tự → 403 (message "deleted here" — kiểm 2 message khác nhau).
  4. **Partner tạo pricing rule** trên listing flexible của mình, mode hợp lệ → 2xx; psql
     `pricing_rules` có row, `price` đúng; `outbox_events` có `pricing_rule.created` payload
     `{pricingRuleId, listingId}`.
  5. **Pricing rule mode không bật** → 400 `MODE_NOT_ENABLED` message nội suy đúng; body **có
     `statusCode`** (chuẩn hóa). Trên listing `fixed_packages` → 400 `PACKAGE_PRICING_FIXED`.
  6. **Partner tạo `date_time_range` chồng window đã có** → 400 `PRICING_RULE_OVERLAP` message đúng
     dạng `Pricing window overlaps <from>–<to>` (en-dash).
  7. **Partner tạo lại `date_range` cùng params** → replace (row cũ biến mất, row mới thay); psql
     xác nhận.
  8. **Partner delete pricing rule của mình** → 2xx; `outbox_events` `pricing_rule.deleted`
     `{pricingRuleId, listingId}`. **Tenant delete pricing rule** → 2xx; payload `{pricingRuleId}`
     (KHÔNG listingId) — kiểm khác nhau.
  9. **Pricing rule không thuộc listing** (partner path, ruleId của listing khác) → 404
     `PRICING_RULE_NOT_FOUND`.
  10. **Tenant tạo resource** → 2xx; psql `resources` có row, `timezone` = default tenant nếu không
      gửi; `outbox_events` `resource.created` `{resourceId}`.
  11. **Regression xuyên module**: đặt 1 booking trên listing có pricing rule vừa tạo (đường
      storefront) → thành công, quote áp đúng rule (chứng minh `listByListing`/`findById` +
      `PricingRuleRecord`/`ResourceRecord` còn nguyên cho booking + scheduling).

  Case nào không dựng được headless thì **nói rõ**, đừng bịa. Dọn sạch row tạo ra.

- [ ] **Step 5:** Commit docs, push, `gh pr create --base refactor/entity-centric`. Body nêu: 3
  aggregate phụ, envelope-normalization statusCode (vô hình consumer), 2 payload `pricing_rule.deleted`
  giữ nguyên, overlap chỉ partner-path (known gap), `listByListing`/`findById` đóng băng cho
  booking+scheduling, và `listing-errors.ts` dùng chung cho #11b/#11c.
- [ ] **Step 6:** Báo controller — KHÔNG tự merge, KHÔNG tự bắt đầu #11b.
