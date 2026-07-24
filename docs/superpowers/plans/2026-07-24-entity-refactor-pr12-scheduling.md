# PR #12 — ListingWeeklySchedule + ResourceCalendar (scheduling) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Module scheduling (6 use-case, 11 endpoint — nhưng write-surface chỉ **3 use-case**,
**0 outbox emit**, **5 throw**): 2 aggregate mỏng `ListingWeeklySchedule` (bộ rule tuần của 1
listing, replace nguyên set) + `ResourceCalendar` (lịch exception theo ngày của 1 resource,
upsert/delete). Không máy trạng thái. Wire byte-identical 100% — **không có** ngoại lệ envelope
nào trong PR này (5 throw hiện tại đều đã có `statusCode` trong body).

**Khảo sát nguồn:** `scratchpad/pr12-scheduling-survey.md` (agent opus đọc code 2026-07-24) +
`docs/refactor/entity-centric-survey.md` mục scheduling. Số liệu dưới đây đã đối chiếu cả hai.

**Architecture:** Spec
[`2026-07-23-api-entity-centric-refactor-design.md`](../specs/2026-07-23-api-entity-centric-refactor-design.md)
§3 + style-gate. Pattern như #11a: use-case làm I/O, truyền dữ kiện đã resolve vào entity.

## Global Constraints

- **KHÔNG test** (ADR 0005); verify = `typecheck` + `lint` + `build` + chạy app.
- **ADR 0006**: không service class; 1 use-case = 1 file, 1 `execute()`.
- Node **22.22.0** (`source ~/.nvm/nvm.sh && nvm use`), chỉ **pnpm**; smoke `PORT=3001`; không đụng
  container/process project khác.
- Branch **`refactor/entity-scheduling`** (base `8842974`), PR vào `refactor/entity-centric`.
  Trước MỌI commit: `git branch --show-current` phải là `refactor/entity-scheduling`.
- **Track song song với payments (#13)**: worktree `../booking-saas-wt-payments` là của track khác —
  TUYỆT ĐỐI không đụng.

### Wire đóng băng — 5 throw (giữ từng ký tự; body `{statusCode, code, message}`, không `details`)

| # | code | HTTP | message (nguyên văn) | nơi phát hiện tại |
|---|---|---|---|---|
| 1 | `LISTING_NOT_FOUND` | 404 | `Listing not found` | `availability-support.ts:25` (`assertListing`) |
| 2 | `NOT_OWNED` | 403 | `Listing belongs to another partner` | `availability-support.ts:28` (`assertListing`, chỉ khi có `partnerId`) |
| 3 | `RESOURCE_NOT_FOUND` | 404 | `Resource not found` | `availability-support.ts:45` (`assertResource`) |
| 4 | `NOT_OWNED` | 403 | `Resource belongs to another partner` | `availability-support.ts:48` (`assertResource`, chỉ khi có `partnerId`) |
| 5 | `EXCEPTION_NOT_FOUND` | 404 | `Exception not found` | `delete-availability-exception.use-case.ts:33` |

Cả 5 hiện là Nest `HttpException` với object literal `{statusCode, code, message}` → body y hệt
envelope của `DomainExceptionFilter` (`{statusCode, code, message}`, không `details`) ⇒ chuyển sang
`DomainError` là **byte-identical** (cùng thứ tự key, cùng status line). Không ai
`catch`/`instanceof` các exception này (đã grep — catch duy nhất trong module là
`ListingModeConfigError` ở get-availability, read path, không đụng).

**Tái sử dụng error theo style-gate 3 (định nghĩa MỘT lần):** #1 `ListingNotFound` và #3
`ResourceNotFound` **đã tồn tại byte-identical** ở `listing/domain/errors/listing-errors.ts`
(seam scheduling→listing đã sanctioned — application scheduling vốn import port của listing).
**KHÔNG mint lại.** #2/#4/#5 là shape riêng của scheduling → mint mới. Chú ý: `NOT_OWNED` của
scheduling KHÁC cả 3 shape not-owned của listing (§8a) — message không có "This".

### Response shape đóng băng (write endpoints)

- PUT `…/availability-rules` → **200**, body = **array** `{id, listingId, dayOfWeek, openTime, closeTime}`
  theo thứ tự `dayOfWeek asc, openTime asc` (thứ tự do `listByListing` re-read trong repo).
- POST `…/availability-exceptions` → **201**, body = object `{id, resourceId, date, type, openTime, closeTime, reason}`
  (null giữ nguyên null).
- DELETE `…/availability-exceptions/:exceptionId` → **204**, body rỗng.
- Mapper `toRuleResponse`/`toExceptionResponse` + DTO + zod contracts: **không đổi**.

### Hành vi ngữ nghĩa đóng băng (không phải bug — là hợp đồng)

1. **POST exception là UPSERT** trên `resourceId_date`: POST trùng (resource, date) GHI ĐÈ row cũ
   và vẫn trả **201**, không bao giờ 409. Giữ nguyên (repo upsert giữ nguyên hình dạng).
2. **`replaceForListing` = deleteMany → createMany** (mảng rỗng = xoá hết, skip createMany) →
   re-read `listByListing`. Giữ nguyên shape SQL (CAS-rule: đây là "atomic replace" của module).
3. **Tenant-path không bao giờ 403 NOT_OWNED** (ctx không có partnerId → ownership skip). Giữ
   `partnerId?: string` optional.
4. **Delete pre-check `findById` trong CÙNG tx** rồi mới `delete({where:{id}})` — P2025 unreachable.
   Giữ thứ tự này (đừng bỏ pre-check, đừng thêm guard vào repo).
5. Cache invalidate `invalidateResource(resourceId)` gọi **NGOÀI (sau) forTenant tx** ở cả 3
   use-case. Giữ vị trí. Cache key/TTL không đổi.
6. **0 outbox emit** trên write path; **0 audit write**. Đừng thêm.

### ⛔ Known gap — GIỮ NGUYÊN (§8a đã ghi, đừng siết)

- 2 window cùng weekday chồng nhau: **không check** ở đâu cả (DB/zod/domain đều nhận). Entity KHÔNG
  được thêm check overlap.
- Exception `type='closed'` vẫn được mang `openTime`/`closeTime` (zod superRefine chỉ validate
  `custom_hours`) và repo lưu nguyên. Entity KHÔNG được reject/normalize closed-with-hours.

### Validation defensive-depth (style-gate 4)

Entity validate creation invariant **mirror zod** (rule: HH:MM, 0..6, open<close, ≤50; exception
custom_hours: đủ cặp + open<close) — là defensive depth, zod pipe là boundary thật, các nhánh này
**unreachable qua HTTP** ⇒ error class mới không cần khớp byte envelope nào, chỉ cần doc comment
nói rõ. KHÔNG validate quá zod (đừng thêm check zod không có — xem Known gap).

### ⛔ Bề mặt đóng băng xuyên module

- Consumer NGOÀI scheduling: **chỉ catalog**, import pure fns/types từ
  `domain/availability/{date-util, interval, open-windows}` (`parseDate`, `weekdayOf`, `Interval`,
  `overlaps`, `overlapsAny`, `contains`, `openWindowsForDate`, `WeeklyRule`, `DateException`).
  **Không đổi path/signature/nội dung các file này.** (Catalog có `HOLD_READER` symbol RIÊNG của nó
  — không liên quan token của scheduling.)
- Read-side đóng băng: `get-availability` (kể cả 2 port read `BUSY_READER`/`HOLD_READER`,
  busy-predicate SQL byte-sync GiST — **không đụng**), `list-availability-rules`,
  `list-availability-exceptions` (horizon 180 ngày giữ nguyên), mapper, 3 controller, DTO, contracts.
  Ngoại lệ duy nhất: 2 list use-case import `assertListing`/`assertResource` từ
  `availability-support` — đổi RUỘT helper (error class) lan sang read path nhưng **wire
  byte-identical** (bảng trên) và code read use-case **0 diff**.
- Port `IAvailabilityRuleRepository`/`IAvailabilityExceptionRepository`: 0 consumer ngoài module →
  được retype tham số write (record/return shape giữ nguyên).

### §4 bắt buộc — normalize outbox tenantId (đụng file đăng ký = phải làm)

`scheduling.module.ts:79` đang `event.tenantId ?? ''` → thay bằng **validate-and-skip-with-log**,
copy pattern `requireTenantId` của `affiliate.module.ts:157-170` (private method + `Logger`,
message `` `skipping ${eventType}: outbox event has no tenantId` ``, trả `null` → handler return
sớm, KHÔNG throw). Chỉ 8 handler BOOKING_BUSY_EVENTS dùng tenantId; 3 handler
pricing_rule/listing.updated không đụng. Hành vi handler trước/sau: các handler đều là cache-delete
no-throw — chiều duy nhất đổi là event thiếu tenantId: trước = `forTenant('')` crash uuid-cast +
kẹt retry vĩnh viễn; sau = skip + log (normalization duy nhất được §4 cho phép).

---

### Task 1: Domain errors

**Files:** Create `apps/api/src/modules/scheduling/domain/errors/availability-errors.ts`.

5 class, extend `DomainError` (`shared/domain/domain-error`):

| Class | code | HTTP | message |
|---|---|---|---|
| `ListingNotOwnedForAvailability` | `NOT_OWNED` | 403 | `Listing belongs to another partner` |
| `ResourceNotOwnedForAvailability` | `NOT_OWNED` | 403 | `Resource belongs to another partner` |
| `AvailabilityExceptionNotFound` | `EXCEPTION_NOT_FOUND` | 404 | `Exception not found` |
| `InvalidAvailabilityRule` | `INVALID_AVAILABILITY_RULE` | 400 | tự do, mô tả vi phạm (defensive) |
| `InvalidAvailabilityException` | `INVALID_AVAILABILITY_EXCEPTION` | 400 | tự do (defensive) |

Doc comment bắt buộc: (a) 2 class NOT_OWNED ghi rõ KHÁC 3 shape not-owned của listing (không có
"This", xem §8a) — không hoán đổi được; (b) 2 class `Invalid*` ghi "defensive depth — zod
(`availability.ts` contracts) là boundary thật, unreachable qua HTTP". KHÔNG mint
`ListingNotFound`/`ResourceNotFound` (import từ listing ở Task 3). Khuôn file theo
`listing/domain/errors/listing-errors.ts`.

- [ ] **Step 1:** Viết file. **Step 2:** `pnpm --filter=@booking/api typecheck` exit 0.
  **Step 3:** Commit `feat(scheduling): domain errors cho availability write-path`.

---

### Task 2: 2 aggregate

**Files:**
- Create `apps/api/src/modules/scheduling/domain/entities/listing-weekly-schedule.entity.ts`
- Create `apps/api/src/modules/scheduling/domain/entities/resource-calendar.entity.ts`

Cả 2 framework-free (không Nest/Prisma/zod import; ĐƯỢC `import type` từ `@booking/contracts` —
style-gate 5: dùng `AvailabilityRuleInput`, `AvailabilityExceptionInput`,
`AvailabilityExceptionType` có sẵn thay vì khai lại). Không clock, không bigint, không random.

- [ ] **Step 1: `listing-weekly-schedule.entity.ts`** — aggregate "bộ rule tuần của 1 listing,
  thay nguyên set":
  ```ts
  export class ListingWeeklySchedule {
    private constructor(
      readonly listingId: string,
      readonly rules: readonly AvailabilityRuleInput[],
    ) {}

    /** Validate + đóng gói nguyên set rule thay thế (atomic replace — không partial). */
    static replaceWith(listingId: string, rules: readonly AvailabilityRuleInput[]): ListingWeeklySchedule
  }
  ```
  `replaceWith` validate (throw `InvalidAvailabilityRule`, defensive-depth mirror zod
  `availabilityRuleInputSchema` + `.max(50)`): (1) `rules.length <= 50`; (2) từng rule:
  `dayOfWeek` integer 0..6, `openTime`/`closeTime` khớp `/^([01]\d|2[0-3]):[0-5]\d$/`,
  `openTime < closeTime` (string compare). Mảng RỖNG hợp lệ (= xoá hết lịch). Doc comment known
  gap: **không** check overlap cùng weekday (§8a — giữ nguyên).

- [ ] **Step 2: `resource-calendar.entity.ts`** — aggregate "lịch exception của 1 resource":
  ```ts
  export class ResourceCalendar {
    private constructor(readonly resourceId: string) {}
    static forResource(resourceId: string): ResourceCalendar

    /** Validate input exception (defensive mirror zod superRefine). Upsert semantics:
     *  (resource, date) đã có → repo GHI ĐÈ, vẫn 201 — hợp đồng, không phải bug. */
    newException(input: AvailabilityExceptionInput): AvailabilityExceptionInput

    /** Exception chỉ được xoá qua đúng resource của nó. */
    assertOwnsException(existing: { resourceId: string } | null): asserts existing is { resourceId: string }
  }
  ```
  - `newException`: nếu `type === 'custom_hours'` → bắt buộc có cả `openTime` và `closeTime` và
    `openTime < closeTime`, sai thì throw `InvalidAvailabilityException`; nếu `type === 'closed'`
    → **pass-through nguyên vẹn** (kể cả khi client gửi kèm hours — known gap §8a, KHÔNG reject,
    KHÔNG strip). Trả lại chính input (đã validate) — normalize `?? null` vẫn Ở REPO như cũ.
  - `assertOwnsException(existing)`: `!existing || existing.resourceId !== this.resourceId` →
    throw `AvailabilityExceptionNotFound`.
  - State chỉ có `resourceId` — cố ý KHÔNG load cả set exception (thêm query = đổi behavior; upsert
    của repo là "CAS" của module này). Ghi doc comment điều đó.

- [ ] **Step 3:** Typecheck exit 0. **Step 4:** Commit
  `feat(scheduling): ListingWeeklySchedule + ResourceCalendar aggregate`.

---

### Task 3: Wire 3 write use-case + availability-support + port retype + outbox normalize

**Files:** `availability-support.ts`; `set-availability-rules.use-case.ts`,
`add-availability-exception.use-case.ts`, `delete-availability-exception.use-case.ts`;
`availability-rule-repository.port.ts`; `scheduling.module.ts`.
**KHÔNG đụng:** 2 list use-case, get-availability, mapper, controllers, DTO, contracts, 2 repo
implementation (trừ khi retype param buộc đổi type annotation — thân method giữ nguyên).

- [ ] **Step 1: `availability-support.ts`** — giữ NGUYÊN path, tên hàm, chữ ký, thứ tự check,
  `ManageContext`; chỉ đổi throw:
  - `assertListing`: `NotFoundException({…})` → `throw new ListingNotFound()` (import
    `listing/domain/errors/listing-errors`); `ForbiddenException({…})` →
    `throw new ListingNotOwnedForAvailability()`.
  - `assertResource`: → `throw new ResourceNotFound()` / `throw new ResourceNotOwnedForAvailability()`.
  - Bỏ import `@nestjs/common`. (2 read use-case import helper này — wire không đổi, code chúng 0 diff.)
- [ ] **Step 2: `set-availability-rules.use-case.ts`** — trong `forTenant`:
  `assertListing(...)` như cũ → `const schedule = ListingWeeklySchedule.replaceWith(listingId, rules)`
  → `this.rules.replaceForListing(tx, ctx.tenantId, listingId, schedule.rules)`. Cache invalidate
  giữ NGOÀI tx. Return shape giữ nguyên.
- [ ] **Step 3: `add-availability-exception.use-case.ts`** — trong `forTenant`:
  `assertResource(...)` → `const calendar = ResourceCalendar.forResource(resourceId)` →
  `this.exceptions.create(tx, ctx.tenantId, resourceId, calendar.newException(data))`. Cache ngoài tx.
- [ ] **Step 4: `delete-availability-exception.use-case.ts`** — trong `forTenant`:
  `assertResource(...)` → `findById` như cũ →
  `ResourceCalendar.forResource(resourceId).assertOwnsException(existing)` (thay inline throw
  `EXCEPTION_NOT_FOUND`) → `delete`. Pre-check vẫn TRƯỚC delete, cùng tx.
- [ ] **Step 5: Port retype** — `replaceForListing(…, rules: readonly AvailabilityRuleInputData[])`
  (nhận được `schedule.rules` readonly; repo `.map` không đổi thân). `AvailabilityRuleInputData`
  giữ nguyên. KHÔNG đổi gì khác trên 2 port.
- [ ] **Step 6: `scheduling.module.ts`** — normalize theo khối "§4 bắt buộc" ở Global Constraints
  (private `requireTenantId` + `Logger`, copy khuôn affiliate; handler booking events: lấy
  tenantId, `null` → return sớm). 3 handler còn lại + BOOKING_BUSY_EVENTS list + mọi provider
  giữ nguyên.
- [ ] **Step 7:** `pnpm --filter=@booking/api typecheck` + lint + build exit 0.
- [ ] **Step 8: Đối chiếu** `git diff HEAD -- apps/api/src/modules/scheduling`:

  | Điểm | Kỳ vọng |
  |---|---|
  | 5 throw | code/status/message/body-shape y hệt bảng đóng băng (2 cái từ listing errors, 3 cái mới) |
  | Response 3 endpoint | không đổi (mapper/controller 0 diff) |
  | Repo 2 file | 0 diff thân method (chỉ được phép đổi type annotation param nếu Step 5 buộc) |
  | get-availability + 2 list UC + contracts + DTO | 0 diff |
  | pure fns catalog dùng | 0 diff |
  | Cache | invalidateResource vẫn ngoài tx; key không đổi |
  | Outbox wiring | chỉ khác: requireTenantId skip-with-log thay `?? ''` |
  | Entity | không import Nest/Prisma/zod; không Date.now/new Date |

- [ ] **Step 9:** Commit `refactor(scheduling): write use-case qua aggregate + outbox tenantId skip-with-log`.

---

### Task 4: Docs + verify + smoke + PR

- [ ] **Step 1: Docs**
  - `docs/refactor/HANDOFF.md` §1: thêm row `| 12 | scheduling | 🔍 review (PR #NN) |`, cập nhật
    đoạn "Việc kế tiếp"; §7: bỏ scheduling khỏi danh sách `event.tenantId ?? ''` còn lại. Ghi 1
    câu: đợt này owner cho chạy 2 track song song (scheduling + payments), mỗi module vẫn 1 PR.
  - Spec `2026-07-23-api-entity-centric-refactor-design.md` §8c-bis mục 9: bỏ scheduling khỏi danh
    sách module còn pattern.
  - `apps/api/CLAUDE.md`: thêm scheduling vào danh sách module đã refactor entity-centric (nếu file
    đang liệt kê).
  - KHÔNG thêm known-gap mới vào §8a (2 gap scheduling đã có sẵn từ trước; upsert-201 là hợp đồng,
    ghi trong PR body chứ không phải gap).
- [ ] **Step 2:** `source ~/.nvm/nvm.sh && nvm use && pnpm turbo lint typecheck build` exit 0 +
  `pnpm --filter=@booking/api check:rls` xanh. (Không đổi rule lint nên không cần `--force`.)
- [ ] **Step 3:** Boot API `PORT=3001 pnpm --filter=@booking/api dev`; kill khi xong. (Track
  payments có thể smoke cùng lúc trên 3002 — nếu đụng dữ liệu seed thì serialize.)
- [ ] **Step 4: Smoke** (headless curl; partner `giang@giangstudio.vn`/`demo-password` +
  `x-tenant-id`/`x-partner-id`; tenant owner `owner@studiohub.vn`. Lấy listing/resource id qua
  psql `docker compose exec -T postgres psql -U postgres -d booking`. **Snapshot rule set hiện có
  của listing trước khi PUT, PUT trả lại nguyên trạng khi xong; xoá exception tự tạo.**)

  1. Partner PUT rules listing của mình (2 rule hợp lệ) → 200 array đúng thứ tự
     `dayOfWeek asc, openTime asc`; psql thấy đúng row, `tenant_id` đúng.
  2. Partner PUT rules `[]` → 200 `[]`; psql 0 row (delete-all path). (Rồi PUT trả lại snapshot.)
  3. Partner PUT rules listing của partner KHÁC → 403 `{statusCode:403, code:"NOT_OWNED",
     message:"Listing belongs to another partner"}` — so từng byte body.
  4. PUT listing id không tồn tại (uuid hợp lệ) → 404 `LISTING_NOT_FOUND` `Listing not found`.
  5. Partner POST exception `closed` (ngày mai) → 201 body đủ field, hours null; POST LẠI cùng
     date với `custom_hours` 09:00–17:00 → **201** (không 409), psql đúng **1 row** đã đổi type
     (upsert giữ nguyên).
  6. POST exception resource của partner khác → 403 `NOT_OWNED` `Resource belongs to another
     partner`; resource không tồn tại → 404 `RESOURCE_NOT_FOUND`.
  7. DELETE exception vừa tạo → 204 body rỗng; DELETE lại → 404 `EXCEPTION_NOT_FOUND`
     `Exception not found`; tạo exception ở resource A rồi DELETE qua path resource B (id thật
     của B) → 404 `EXCEPTION_NOT_FOUND` (mismatch guard).
  8. Tenant owner PUT rules trên listing partner bất kỳ → **200** (không 403 — tenant path bỏ
     ownership check, asymmetry giữ nguyên).
  9. Zod vẫn là boundary: PUT rule `openTime:"18:00", closeTime:"09:00"` → 400
     `VALIDATION_ERROR` (envelope pipe, không phải error mới); POST exception `custom_hours`
     thiếu closeTime → 400 `VALIDATION_ERROR`.
  10. Regression read: GET `partner/listings/:id/availability-rules` → 200; GET public
      `/public/listings/:slug/availability` (Host: localhost) quanh ngày có exception `closed` →
      ngày đó không mở slot (read path + openWindowsForDate còn nguyên).
  11. Outbox skip-with-log: (best-effort) xác nhận qua code-read rằng handler booking events skip
      khi thiếu tenantId; nếu môi trường cho phép, tạo 1 booking thật để thấy invalidate vẫn chạy
      bình thường có tenantId (không bắt buộc).

  Case nào không dựng được headless thì **ghi rõ trong PR body**, đừng bịa.

- [ ] **Step 5:** Cập nhật `.superpowers/sdd/progress.md`; commit docs; push;
  `gh pr create --base refactor/entity-centric` — body nêu: 3 use-case chuyển aggregate, bảng 5
  throw byte-identical (2 reuse từ listing errors), upsert-201 + delete-all + tenant-no-ownership
  là hợp đồng giữ nguyên, outbox `?? ''` → skip-with-log (normalization §4, chiều đổi duy nhất là
  event thiếu tenantId), read-side + pure fns catalog 0 diff, known gap §8a giữ nguyên, kết quả
  smoke từng case.
- [ ] **Step 6:** Báo controller — **KHÔNG merge** (quyết định owner).
