# PR #10b — SubscriptionPlan + TenantSubscription aggregate (tenancy, nửa billing) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Đóng nốt module tenancy — đưa rule của catalog plan (đặt tên, repricing, xoá 2 tầng) và của
subscription (kỳ hạn hợp lệ, append-only, plan limits) vào aggregate. Wire byte-identical.

**Architecture:** Theo spec
[`2026-07-23-api-entity-centric-refactor-design.md`](../specs/2026-07-23-api-entity-centric-refactor-design.md)
§3 + style-gate (đã có 2 rule mới từ PR #10a: import enum từ contracts khi đã có; không thêm
getter/method không consumer). Nửa Tenant + TenantDomain đã xong ở PR #10a — **không đụng lại**.

## Global Constraints

- **KHÔNG test** (ADR 0005); verify = `typecheck` + `lint` + `build` + chạy app.
- **ADR 0006**: không service class; 1 use-case = 1 file, 1 `execute()`.
- Node **22.22.0** (`nvm use`), chỉ **pnpm**; smoke `PORT=3001` nếu 3000 bận; không đụng
  container/process project khác.
- Branch **`refactor/entity-tenancy-billing`** (đã tạo, base `2b3e983`), PR vào
  `refactor/entity-centric`. **Mọi commit trên nhánh feature** — PR #25 đang mở trên nhánh tích hợp.

### ⛔ Bẫy #1 — hai message KHÁC NHAU cùng mã `PLAN_HAS_SUBSCRIBERS`, và cả hai có `details`

`update-plan` (repricing) và `delete-plan` (còn subscriber sống) **cùng** phát mã
`PLAN_HAS_SUBSCRIBERS` nhưng **message hoàn toàn khác nhau**, và **cả hai kèm field `details`**
(`{ subscribers: n }`). `DomainError` hỗ trợ `details` — phải truyền vào, nếu bỏ sót thì envelope
mất field và dashboard mất thông tin. Xem bảng wire bên dưới, copy nguyên văn từng ký tự (chú ý các
message này nối chuỗi nhiều dòng bằng `+`).

### ⛔ Bẫy #2 — bề mặt xuyên module rất lớn, nhưng KHÔNG phải cái bạn nghĩ

- **`RequireActiveSubscriptionGuard`** — **19 file, 86 chỗ dùng** ở 8 module khác. Guard này gọi
  `subscriptions.findCurrentByTenant` + `evaluateSubscription`. **Không đổi tên, không đổi hành vi,
  không đổi chữ ký.** Nó nằm ở `infrastructure/http/guards/` — chỉ đổi chỗ throw sang domain error
  (message/code/status giữ nguyên), không đụng gì khác.
- **`PlanLimitGuard`** — 3 route ở 2 module khác. Cùng nguyên tắc.
- **`AssertCanAddPartnerUseCase`** — 1 consumer (`partner/apply-as-partner`). Giữ chữ ký.
- **KHÔNG có consumer ngoài module** cho: `SUBSCRIPTION_REPOSITORY`, `PLAN_REPOSITORY`,
  `ISubscriptionRepository`, `GetPlanLimitsUseCase`, `CheckBookingQuotaUseCase`,
  `AssertCanAddListingUseCase`, `evaluateSubscription` ⇒ các thứ này **được tự do** đổi shape nội bộ.

### ⛔ Bẫy #3 — admin pool, không có `tx` ở đâu cả

**Không method nào** của `IPlanRepository`/`ISubscriptionRepository` nhận `tx`; tất cả chạy thẳng
trên `prisma.admin` (BYPASSRLS). `update-plan` và `delete-plan` đều là chuỗi 3–4 round-trip **không
transaction** ⇒ có TOCTOU sẵn giữa bước đếm và bước ghi. **Giữ nguyên** — đừng thêm transaction,
đừng thêm `tx` vào port.

### ⛔ Bẫy #4 — bigint kỷ luật đang ĐÚNG, đừng phá

`priceMonthly` là `bigint` end-to-end: parse bằng `BigInt(...)` ở use-case, cộng dồn MRR bằng `0n`,
chỉ `.toString()` ở mapper. **Không có `Number()` nào** trên đường tiền. Entity giữ `bigint`;
`JSON.stringify` không bao giờ được thấy entity.

### Wire đóng băng — giữ từng ký tự (kể cả `details`)

| code | status | message | nơi phát |
|---|---|---|---|
| `PLAN_NOT_FOUND` | 404 | `` Plan ${id} not found `` | update-plan, delete-plan, assign-subscription (dùng `input.planId`) |
| `PLAN_NAME_TAKEN` | 409 | `` Plan name "${name}" is already in use `` | update-plan |
| `PLAN_HAS_SUBSCRIBERS` | 409 | **message repricing** (xem Task 1) + `details: { subscribers: n }` | update-plan |
| `PLAN_HAS_SUBSCRIBERS` | 409 | **message delete** (KHÁC hẳn) + `details: { subscribers: n }` | delete-plan |
| `PLAN_HAS_SUBSCRIPTION_HISTORY` | 409 | (xem Task 1) + `details: { subscriptions: n }` | delete-plan |
| `INVALID_SUBSCRIPTION_PERIOD` | 400 | `expiresAt must be after startsAt` | assign-subscription |
| `NO_ACTIVE_PLAN` | 403 | `Tenant has no active subscription plan` | plan-limit-errors |
| `PLAN_LIMIT_REACHED` | 403 | `` Plan limit reached for ${key} (max ${limit}) `` | plan-limit-errors |
| `PLAN_FEATURE_DISABLED` | 403 | `The current plan does not include custom domains` | assert-custom-domain-allowed |
| `SUBSCRIPTION_EXPIRED` | 403 | `Subscription has expired — the dashboard is read-only` | require-active-subscription.guard |

`TENANT_NOT_FOUND` ở `assign-subscription`/`list-subscriptions` **đã dùng shared kernel từ PR #10a**
— không đụng.

### Known gap — GIỮ NGUYÊN, ghi sổ (§8a)

1. **Ba bản "current subscription" KHÔNG thống nhất** (phát hiện chính của khảo sát):
   - `findCurrentByTenant` (TS, `prisma-subscription.repository.ts`): `orderBy startsAt DESC`,
     **không tiebreak**, **không lọc status**, **không lọc hết hạn**.
   - `liveSubscriberCounts` (SQL): `DISTINCT ON (tenant_id) ORDER BY starts_at DESC, created_at DESC`
     + lọc `status IN (billable)` + `expires_at > now()`.
   - `get-platform-health` (SQL): cùng ORDER BY như trên, **không lọc** trong SQL, lọc bằng
     `evaluateSubscription` ở JS.
   ⇒ Khi hai row cùng `startsAt`, bản TS có thể chọn row **khác** hai bản SQL. **Không sửa** ở PR này
   (thêm tiebreak = đổi hành vi ở đường guard/limit). Ghi §8a + đề xuất PR riêng.
2. **`GetPlanLimitsUseCase` dùng subscription mới nhất bất kể status/hết hạn** ⇒ tenant có
   subscription `expired`/`cancelled` vẫn được cấp limit của plan đó. Liveness chỉ được kiểm riêng
   bởi `RequireActiveSubscriptionGuard` cho đường ghi dashboard. Giữ nguyên, ghi sổ.
3. **Hai đồng hồ**: `evaluateSubscription` dùng app clock ở **cả 4** call site; `liveSubscriberCounts`
   dùng DB `now()` cho **cùng một câu hỏi** "subscription còn sống không". Giữ nguyên, ghi sổ.
4. **`create-plan` không pre-check tên** ⇒ trùng tên leak P2002 thô (update-plan thì có pre-check).
   Giữ nguyên (đã có dòng P2002 cho tenancy ở §8a — bổ sung chi tiết).
5. **TOCTOU ở update-plan/delete-plan**: đếm rồi mới ghi, không transaction. Giữ nguyên.
6. **Comment lỗi thời**: `CheckBookingQuotaUseCase` ghi "The booking module calls this…" nhưng
   **không file nào trong `modules/booking` import nó**; consumer duy nhất là
   `GetSubscriptionStatusUseCase` trong chính tenancy. Ghi sổ (sửa comment được phép — chỉ là comment).

### Dedup AN TOÀN duy nhất được phép

`get-platform-health.use-case.ts:237` khai lại literal `['trial','active','past_due']` thay vì import
`BILLABLE_SUBSCRIPTION_STATUSES`. Giá trị **y hệt** ⇒ thay bằng import là dedup thuần, 0 đổi hành vi.
**Chỉ làm đúng chỗ này**; mọi thứ khác trong `get-platform-health` (read-side) không đụng.

### Đóng băng khác

- Read-side không đụng: `list-plans`, `list-subscriptions`, `get-subscription-status`,
  `get-platform-health` (trừ dòng dedup trên), mapper, controller.
- `evaluateSubscription`, `plan-limits.ts` **đã là pure domain sạch** ⇒ giữ nguyên vị trí và chữ ký;
  entity gọi lại chúng, không chép lại logic.
- Không có `get-plan.use-case.ts` (khảo sát xác nhận) — đừng đi tìm.

---

### Task 1: Domain errors

**Files:** Create `apps/api/src/modules/tenancy/domain/errors/billing-errors.ts`

**Interfaces:** `PlanNotFound(id)`, `PlanNameTaken(name)`, `PlanRepricingNeedsConfirmation(count)`,
`PlanHasLiveSubscribers(count)`, `PlanHasSubscriptionHistory(count)`, `InvalidSubscriptionPeriod`,
`NoActivePlan`, `PlanLimitReached(key, limit)`, `PlanFeatureDisabled`, `SubscriptionExpired`.

- [ ] **Step 1:** Đọc 5 file sau và **copy nguyên văn** từng message (nhiều message nối chuỗi bằng
  `+` qua nhiều dòng — giữ đúng khoảng trắng cuối mỗi mảnh):
  `application/use-cases/update-plan.use-case.ts`, `delete-plan.use-case.ts`,
  `assign-subscription.use-case.ts`, `application/plan-limit-errors.ts`,
  `application/use-cases/assert-custom-domain-allowed.use-case.ts`,
  `infrastructure/http/guards/require-active-subscription.guard.ts`.

  Viết file theo khuôn của `domain/errors/tenancy-errors.ts` (PR #10a). Hai lớp
  `PlanRepricingNeedsConfirmation` và `PlanHasLiveSubscribers` **cùng code** `PLAN_HAS_SUBSCRIBERS`
  nhưng khác message — đặt doc comment nói rõ chúng **không thay thế được cho nhau**, giống cách
  `DomainNotFoundForTenant`/`DomainNotFound` đã làm. Cả ba lớp có `details` phải truyền tham số thứ 4
  của `DomainError`: `{ subscribers: n }` hoặc `{ subscriptions: n }`.

- [ ] **Step 2:** Typecheck exit 0. **Step 3:** Commit
  `feat(tenancy): domain errors cho SubscriptionPlan + TenantSubscription`.

---

### Task 2: `SubscriptionPlan` + `TenantSubscription` aggregate

**Files:** Create `domain/entities/subscription-plan.entity.ts`, `domain/entities/tenant-subscription.entity.ts`

- [ ] **Step 1: `subscription-plan.entity.ts`** — `PlanState` (id, name, priceMonthly: bigint,
  limits, isActive), `NewSubscriptionPlan`, `SubscriptionPlanPatch`; class với:
  - `static rehydrate(state)`
  - `static open({ name, priceMonthly, limits, isActive }): NewSubscriptionPlan` — assembly của
    `create-plan` (tiền đã là `bigint` do use-case parse). **Không** thêm pre-check tên (gap #4).
  - `applyUpdate(input, subscriberCount): SubscriptionPlanPatch` — nuốt rule repricing: nếu
    `priceMonthly` được gửi **và khác giá đang lưu** **và** `subscriberCount > 0` **và**
    `repriceExistingSubscribers !== true` ⇒ `throw new PlanRepricingNeedsConfirmation(subscriberCount)`.
    Ngược lại trả patch chỉ gồm key được gửi (giữ đúng ngữ nghĩa `undefined` = giữ nguyên).
  - `assertDeletable(liveSubscribers, totalSubscriptions)` — **hai tầng đúng thứ tự**: live trước
    (`PlanHasLiveSubscribers`), history sau (`PlanHasSubscriptionHistory`).
  Doc comment ghi rõ phần **không** sở hữu: tên duy nhất (DB unique + pre-check advisory ở update,
  create không có), và việc đếm subscriber do use-case resolve rồi truyền vào.

- [ ] **Step 2: `tenant-subscription.entity.ts`** — `NewTenantSubscription`; class với
  `static assign({ tenantId, planId, status, startsAt, expiresAt, note }): NewTenantSubscription`
  ném `InvalidSubscriptionPeriod` khi `expiresAt <= startsAt`. Doc comment nêu:
  - stream **append-only** — một row mới thay thế row cũ, lịch sử không bao giờ bị sửa;
  - định nghĩa "current" **hiện đang có 3 bản không thống nhất** (nêu rõ bản TS thiếu tiebreak) và
    đây là known gap đã ghi §8a — **không** tự ý sửa;
  - `evaluateSubscription` (`domain/subscription-status.ts`) vẫn là nơi duy nhất chứa rule vòng đời
    §6.5, entity **không** chép lại.

- [ ] **Step 3:** Typecheck exit 0. **Step 4:** Commit
  `feat(tenancy): SubscriptionPlan + TenantSubscription aggregate`.

---

### Task 3: Wire use-case + guard + dedup

**Files:** `create-plan`, `update-plan`, `delete-plan`, `assign-subscription` use-cases;
`application/plan-limit-errors.ts`; `assert-custom-domain-allowed.use-case.ts`;
`infrastructure/http/guards/require-active-subscription.guard.ts`;
`application/use-cases/get-platform-health.use-case.ts` (chỉ 1 dòng dedup).

- [ ] **Step 1: `create-plan`** — dùng `SubscriptionPlan.open(...)`; giữ nguyên `BigInt(...)` parse
  ở use-case và việc **không** pre-check tên.
- [ ] **Step 2: `update-plan`** — 404 → `PlanNotFound(id)`; 409 tên → `PlanNameTaken(input.name)`;
  khối repricing → `plan.applyUpdate(input, subscriberCount)`. **Giữ nguyên thứ tự bước và số
  round-trip**: findById → (nếu đổi tên) findByName → parse BigInt → `liveSubscriberCounts()` →
  update. Không thêm transaction.
- [ ] **Step 3: `delete-plan`** — 404 → `PlanNotFound(id)`; hai gate →
  `SubscriptionPlan.rehydrate(plan).assertDeletable(live, totalSubscriptions)`. Giữ nguyên
  `Promise.all([liveSubscriberCounts(), countSubscriptions(id)])`.
- [ ] **Step 4: `assign-subscription`** — giữ `TenantNotFound` (đã từ PR #10a); 404 plan →
  `PlanNotFound(input.planId)`; khối kỳ hạn → `TenantSubscription.assign({...})`. **Giữ nguyên**
  app-clock fallback `input.startsAt ? new Date(input.startsAt) : new Date()` ở use-case.
- [ ] **Step 5: `plan-limit-errors.ts`** — `requirePlanLimits` ném `NoActivePlan`;
  `planLimitReached(key, limit)` trả `PlanLimitReached(key, limit)`. **Giữ nguyên chữ ký cả hai
  hàm** (4 use-case gọi chúng).
- [ ] **Step 6: `assert-custom-domain-allowed`** — throw → `PlanFeatureDisabled`. Không đụng gì khác.
- [ ] **Step 7: guard `require-active-subscription`** — **chỉ** đổi throw → `SubscriptionExpired`.
  ⚠️ 19 file/86 chỗ dùng guard này: không đổi tên class, không đổi `canActivate`, không đổi thứ tự
  kiểm tra, không đổi clock (`new Date()` tại chỗ).
- [ ] **Step 8: dedup an toàn** — trong `get-platform-health.use-case.ts`, thay literal
  `['trial','active','past_due']` (≈ dòng 237) bằng `BILLABLE_SUBSCRIPTION_STATUSES` import từ
  `domain/subscription-status`. **Chỉ dòng đó**; toàn bộ raw SQL và metric khác không đụng.
  Nếu kiểu TS không khớp (const assertion `readonly`), ép bằng cách spread `[...BILLABLE_...]` chứ
  **không** đổi khai báo const.
- [ ] **Step 9:** Typecheck + lint + build exit 0.
- [ ] **Step 10: Đối chiếu** — `git diff HEAD -- apps/api/src/modules/tenancy`:

  | Điểm | Kỳ vọng |
  |---|---|
  | 10 dòng wire | code/status/message y hệt, **2 message khác nhau của `PLAN_HAS_SUBSCRIBERS` đều còn** |
  | `details` | cả 3 lỗi có `details` vẫn phát đúng `{subscribers:n}` / `{subscriptions:n}` |
  | Guard | tên class, chữ ký, thứ tự kiểm tra, clock không đổi |
  | Số round-trip update-plan/delete-plan | không đổi, vẫn không transaction |
  | bigint | không có `Number()` nào mới; entity giữ `bigint` |
  | read-side + mapper + controller | không đụng (trừ 1 dòng dedup) |

- [ ] **Step 11:** Commit `refactor(tenancy): plan + subscription qua aggregate`.

---

### Task 4: Docs + verify + smoke + PR

- [ ] **Step 1: Docs**
  - `apps/api/CLAUDE.md`: đổi `tenancy (Tenant + domains — PR #10a)` thành `tenancy` (đủ module).
  - Spec §8a: thêm 3 dòng — (a) ba bản "current subscription" không thống nhất, bản TS thiếu
    tiebreak `created_at`; (b) `GetPlanLimits` cấp limit theo subscription mới nhất **bất kể
    status/hết hạn**; (c) `create-plan` không pre-check tên ⇒ leak P2002.
  - Spec §8b-bis: thêm — hai đồng hồ (app clock cho `evaluateSubscription` vs DB `now()` cho
    `liveSubscriberCounts`) cùng trả lời một câu hỏi; và đề xuất PR riêng hợp nhất "current
    subscription" về một chỗ.
  - Sửa comment lỗi thời của `CheckBookingQuotaUseCase` (nói booking module gọi, thực tế không).
  - `docs/refactor/HANDOFF.md` §1: `| 10b | tenancy — plan + subscription | 🔍 review (PR #NN) |`,
    tenancy coi như **xong cả module**; module kế tiếp là **PR #11 listing** (L, 45 use-case,
    56 endpoint — nên cân nhắc tách như promotions/tenancy) và nhắc **fixture `draft` phải thêm vào
    seed trước PR #11** (spec §8c-bis mục 2).

- [ ] **Step 2:** `pnpm turbo lint typecheck build` + `check:rls` xanh.
- [ ] **Step 3:** `docker ps`; boot API `PORT=3001`; kill khi xong.
- [ ] **Step 4: Smoke** — platform admin `admin@bookify.local` / `admin-dev-password`
  (route `/admin/plans*`, `/admin/tenants/:id/subscriptions`), tenant owner `owner@studiohub.vn`:

  1. **Tạo plan** → 2xx; psql `subscription_plans` có row, `price_monthly` đúng số (bigint).
  2. **PATCH plan chỉ `name`** → 2xx; psql: `price_monthly`, `limits` **không đổi**.
  3. **PATCH đổi tên trùng plan khác** → 409 `PLAN_NAME_TAKEN` message chính xác.
  4. **PATCH đổi giá plan CÓ subscriber sống, không gửi `repriceExistingSubscribers`** → 409
     `PLAN_HAS_SUBSCRIBERS` với **message repricing** và `details.subscribers` = số thật.
     Rồi gửi lại kèm `repriceExistingSubscribers: true` → 2xx, giá đổi.
  5. **DELETE plan có subscriber sống** → 409 `PLAN_HAS_SUBSCRIBERS` với **message delete** (khác
     hẳn case 4) + `details.subscribers`.
  6. **DELETE plan không có subscriber sống nhưng có lịch sử** → 409
     `PLAN_HAS_SUBSCRIPTION_HISTORY` + `details.subscriptions`.
  7. **DELETE plan hoàn toàn chưa dùng** (plan tạo ở case 1) → 2xx, row biến mất.
  8. **Gán subscription** với `expiresAt <= startsAt` → 400 `INVALID_SUBSCRIPTION_PERIOD`. Gán hợp
     lệ → 2xx; psql: có **row mới**, row cũ **còn nguyên** (append-only).
  9. **Gán subscription với planId lạ** → 404 `PLAN_NOT_FOUND` message động đúng.
  10. **Guard regression (quan trọng nhất)**: gọi một route dashboard bất kỳ có
      `RequireActiveSubscriptionGuard` (ví dụ tạo/sửa listing của tenant) với tenant **đang có
      subscription sống** → 2xx. Nếu dựng được tenant hết hạn thì kiểm 403 `SUBSCRIPTION_EXPIRED`
      message chính xác; nếu không dựng được headless thì **nói rõ**.
  11. **Plan limit regression**: đường `apply-as-partner` (dùng `AssertCanAddPartnerUseCase`) vẫn
      chạy; nếu dựng được tenant chạm `maxPartners` thì kiểm 403 `PLAN_LIMIT_REACHED` message động
      đúng dạng `Plan limit reached for maxPartners (max N)`.

  Case nào không dựng được headless thì **nói rõ**, đừng bịa. Dọn sạch row tạo ra.

- [ ] **Step 5:** Commit docs, push, `gh pr create --base refactor/entity-centric`. Body nêu: 2
  aggregate, **phát hiện ba bản "current subscription" bất đồng** (ghi sổ, không sửa), `GetPlanLimits`
  bỏ qua status/hết hạn, hai đồng hồ, 2 message khác nhau cùng mã `PLAN_HAS_SUBSCRIBERS` + `details`
  giữ nguyên, guard 19-file/86-chỗ chỉ đổi throw, và dedup an toàn duy nhất.
- [ ] **Step 6:** Báo controller — KHÔNG tự merge.
