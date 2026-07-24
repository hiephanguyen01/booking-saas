# PR #13 — Payment + Refund + TenantGatewayConfigs (payments) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Module payments (14 use-case: **8 write**, 6 read; 22 throw site; 9 outbox emit; 1
reconciliation worker; 5 gateway adapter): 3 aggregate `Payment` + `Refund` +
`TenantGatewayConfigs` (thin). Đây là 1 trong 3 module owner từng cân nhắc "không đáng convert"
rồi quyết convert với điều kiện tiên quyết **CAS ở lại repo** (spec §2.8) — reviewer PHẢI soi đúng
điểm đó. Wire byte-identical 100%, không có ngoại lệ envelope nào.

**Khảo sát nguồn:** `scratchpad/pr13-payments-survey.md` (agent opus, 2026-07-24, 167k — bảng lỗi
22 site, CAS SQL nguyên văn, bảng clock, payload 9 emit, consumer key đóng băng) +
`docs/refactor/entity-centric-survey.md` mục payments. **Làm task nào đọc lại mục tương ứng trong
report khảo sát** (path trên) — mọi giá trị nguyên văn nằm ở đó.

**Track song song:** PR này làm trong worktree `/Volumes/OVEN Duy/temp/booking-saas-wt-payments`
(branch **`refactor/entity-payments`**, base `8842974`), PR vào `refactor/entity-centric`.
Track scheduling (#12) chạy ở working tree chính — KHÔNG đụng. Trước MỌI commit:
`git branch --show-current` phải là `refactor/entity-payments`.

## Global Constraints

- **KHÔNG test** (ADR 0005); verify = `typecheck` + `lint` + `build` + chạy app (smoke `PORT=3002`).
- **ADR 0006**: không service class; 1 use-case = 1 file, 1 `execute()`.
- Node **22.22.0** (`source ~/.nvm/nvm.sh && nvm use`), chỉ **pnpm**, chạy trong worktree.
- Entity framework-free: không Nest/Prisma/zod import; **không random** (orderRef `BKF-${randomUUID()}`
  Ở LẠI use-case); **không clock** (nhận `now: Date` tham số); `bigint` trong entity, `.toString()`
  chỉ ở mapper/outbox.

### ⛔ Luật số 1 — CAS ở lại repository (từng shape SQL đóng băng)

| Guard | Ở đâu | Shape giữ nguyên |
|---|---|---|
| Payment succeed | `prisma-payment.repository.ts:112-134` `markSucceeded` | raw SQL `WHERE id=… AND status <> 'succeeded'`, `paid_at = now()` (DB clock) |
| Payment terminal | `:138-145` `markTerminalIfPending` | `updateMany WHERE {id, status:'pending'}` |
| Refund lock | `prisma-refund.repository.ts:108-112` | `pg_advisory_xact_lock(hashtext('refund:' \|\| bookingId))` — prefix `'refund:'` cấm đổi |
| Refund completeAutomatic | `:75-85` | `updateMany WHERE {id, status:'pending', executionMode:'automatic'}` |
| Refund requireManual | `:87-93` | guard như trên, data `{status:'manual_required', executionMode:'manual', dueAt}` |
| Refund markSucceeded | `:95-106` | `updateMany WHERE {id, status IN ('pending','manual_required')}` |
| Gateway single-active | `prisma-gateway-config.repository.ts:68-112` upsert | `updateMany` deactivate (wallet: cùng gateway / base: `notIn WALLET_GATEWAYS`) rồi upsert — TRONG repo, aggregate KHÔNG thay |

- **Bẫy đã ghi spec §5**: `canSucceed` (domain/payment-status.ts:9-11) là DEAD code và **mâu thuẫn**
  guard thật (`pending`-only vs `<> 'succeeded'` — late success ĐƯỢC PHÉP đè failed/expired). **XÓA
  nó, tuyệt đối không hồi sinh làm rule của entity.**
- **Quirk return đóng băng**: `completeAutomatic`/`requireManual`/`markSucceeded` của refund LUÔN
  trả `findById` bất kể guard có match không (`null` = row không tồn tại, KHÔNG phải guard-fail).
  Semantics `if (!updated)` ở use-case chỉ bắt row-missing. Giữ nguyên, đừng "sửa".
- Payment entity **KHÔNG có method transition dựa trên status đã load** — snapshot pre-tx không tin
  được (comment handle-webhook:62-66). Entity chỉ phát biểu policy/intent tĩnh; repo thực thi CAS.

### Wire đóng băng — 22 throw site (cột "PR này": ✎ = convert sang DomainError byte-identical, 🔒 = giữ nguyên không đụng)

Body hiện tại đều là object literal `{statusCode, code, message[, details]}` → filter DomainError
phát envelope y hệt. Bảng đầy đủ + file:line: survey §B. Tóm tắt quyết định:

| # | code (status) | PR này | Ghi chú |
|---|---|---|---|
| 1 | `INVALID_STOREFRONT_HOST` (400) | 🔒 | helper `storefrontOrigin` — parsing request, không phải rule aggregate |
| 2 | `STOREFRONT_SUSPENDED` (403) | 🔒 | liveness tenant — ngoài aggregate |
| 3 | `BOOKING_NOT_FOUND` (404) checkout | ✎ | dùng **shared kernel** `BookingNotFound` mới (booking+finance+payments cùng emit; style-gate 3; #14/#15 sẽ migrate site của họ) |
| 4 | `BOOKING_NOT_PAYABLE` (400, msg template `Booking is ${status}, not awaiting payment`) | ✎ | `Payment.assertPayable` |
| 5 | `PAYMENT_METHOD_UNAVAILABLE` (400) | ✎ | UC throw class mới (routing quyết bởi `pickConfigForMethod` — pure fn giữ nguyên) |
| 6 | `NO_ACTIVE_GATEWAY` (400, VN `Cửa hàng chưa bật cổng thanh toán`) | ✎ | `Payment.assertGatewayAccepts` (mock-in-prod; env flag resolve ở UC truyền vào) |
| 7 | `AMOUNT_EXCEEDS_GATEWAY_LIMIT` (400, VN `Đơn hàng vượt hạn mức thanh toán MoMo (tối đa 50.000.000đ)`) | ✎ | `Payment.assertGatewayAccepts` (momo cap, sau mock check) |
| 8 | `BAD_WEBHOOK` (400) | 🔒 | parse webhook — infra |
| 9 | `INVALID_SIGNATURE` (401) | 🔒 | verify chữ ký — infra |
| 10 | `AMOUNT_MISMATCH` (400) | ✎ | `Payment.assertAmountCovers` (dùng `amountMatches` — pure fn giữ path) |
| 11 | `REFUND_AMOUNT_EXCEEDS_PAYMENT` (400) | ✎ | `Refund.plan` |
| 12 | `REFUND_NOT_FOUND` (404) | ✎ | load-guard confirm-manual-refund |
| 13 | `REFUND_NOT_CONFIRMABLE` (400, msg template `Refund is ${status}`) | ✎ | `Refund.assertConfirmable` |
| 14 | `REFUND_REFERENCE_ALREADY_USED` (400) | ✎ | UC throw sau `manualReferenceExists` (I/O ở UC) |
| 15 | **bare** `NotFoundException()` confirm-manual-refund:55 (body Nest default `{statusCode:404, message:'Not Found', error:'Not Found'}` KHÔNG `code`) | 🔒 | defensive gần-unreachable — GIỮ NGUYÊN từng byte, ghi §8a |
| 16 | `INVALID_GATEWAY_CONFIG` (400, VN + `details: flatten()`) | 🔒 | zod boundary ở UC — giữ |
| 17 | `UNSUPPORTED_PAYMENT_METHOD` (400, VN template `Cổng ${gateway} không hỗ trợ phương thức: ${invalid.join(', ')}`) | ✎ | `TenantGatewayConfigs.assertMethodsSupported` |
| 18 | `GATEWAY_CONFIG_NOT_FOUND` (404, `Configure payment credentials before enabling payment methods`) | ✎ | UC translate repo-null |
| 19 | `BOOKING_NOT_FOUND` get-payment-status | 🔒 | READ use-case — read-side đóng băng |
| 20 | `PAYMENT_NOT_CONFIGURED` (503, 2 site) | 🔒 | READ use-case |
| 21 | `EMPTY_BODY` (400) | 🔒 | controller webhook |
| 22 | `MISSING_HOST` (400) | 🔒 | controller public |

Message VN có dấu — copy từng byte từ survey §B (đừng gõ lại tay). Webhook ack bodies
(`{return_code:1, return_message:'success'}` zalopay / `{success:true}`) + verify-fail THROW
(401/400 tới provider, không phải ack) — controller **0 diff**.

### Outbox đóng băng — 9 emit site / 6 eventType (payload + thứ tự per survey §E)

- `payment.succeeded` ×3 payload KHÁC nhau (webhook `{paymentId, bookingId}`; reconcile giống;
  recovery + `recovery:true, skipBookingConfirmation`). `refund.execution_requested`/`refund.requested`
  chung 1 `outbox.emit` với eventType ternary — GIỮ cấu trúc ternary đó. `refund.completed` ×3.
  `refund.recovery_requested` ×1. Mọi bigint `.toString()`.
- **Consumer ngoài module đọc các key này** (đóng băng tên key): `paymentId`, `bookingId`,
  `amount` (string), `reason`, `affectsBookingStatus`, `refundId`, `skipBookingConfirmation`
  (booking module đọc `skipBookingConfirmation`/`affectsBookingStatus`; finance đọc `paymentId`,
  `refundId`, `amount`, `reason`, `affectsBookingStatus`).
- Emit luôn TRONG forTenant tx đang produce. Thứ tự tương đối audit-write → emit trong
  confirm-manual-refund giữ nguyên.

### Cấu trúc tx đóng băng

- **Checkout**: resolve tenant NGOÀI tx → forTenant duy nhất; **provider `createPayment` TRONG tx**
  (bất đối xứng với refund — là hợp đồng, đừng "sửa"). Reuse-check (`findPendingCheckout`) đứng
  TRƯỚC amount/mock/momo checks — thứ tự lỗi phải giữ nguyên vị trí từng check (xem Task 2).
- **Webhook**: peek không tx → resolve payment qua **admin pool** → forTenant (verify → branch →
  CAS → emit). Không đổi pool nào.
- **Execute-automatic-refund**: **two-phase** — prepare-tx (lock KHÔNG cần, chỉ đọc) → provider
  call NGOÀI mọi tx (+ nhánh `!supported` → `queryPaymentStatus` → `reconciled:void:${reference}`)
  → commit-tx re-lock + re-check. Entity mô hình decision, KHÔNG gộp 2 tx.
- **Execute-refund**: `amount <= 0n` return TRƯỚC tx; trong tx: lock → exists → nothing-paid →
  amount guard → policy → create → emit. Thứ tự cấm đổi.
- Reconciliation worker (`reconciliation.worker.ts`): **0 diff toàn file** — guard branching của nó
  KHÁC webhook có chủ đích (mismatch → warn + để pending; non-succeeded → để pending, KHÔNG mark
  failed). Đừng hợp nhất vào entity.
- Gateway adapters (5 file) + `gateway-registry.ts` + `aes-gcm-crypto` : **0 diff**.

### Clock đóng băng (survey bảng cuối — từng site giữ đúng nguồn)

- Payment: DB `now()` (trong SQL repo) — không đụng.
- Refund `dueAt`: APP clock — `Refund.plan`/`manualDueAt` nhận `now: Date`; use-case truyền
  `new Date()` tại đúng 2 call-site hiện dùng `Date.now()` (execute-refund:77,
  execute-automatic-refund:97). Công thức `now.getTime() + slaHours*60*60*1000`.
- Refund `completedAt`: APP `new Date()` TRONG repo (3 site) — Ở LẠI repo, không kéo vào entity.

### Khác (đóng băng / bắt buộc)

- **Read-side 0 diff**: 6 read use-case, mapper (`toGatewayConfigResponse` hardcode
  `isActive: true`…), controllers, DTO, contracts.
- `idempotencyKey` format `` `checkout:${bookingId}:${paymentMethod}:${created.gatewayOrderRef ?? created.gatewayTxnId ?? orderRef}` `` + orderRef `` `BKF-${randomUUID().replaceAll('-','').toUpperCase()}` `` — ở UC, nguyên văn.
- `findPendingCheckout` legacy parse (`{destination}` + fallback `{paymentUrl}`) — repo, 0 diff.
- **Không có P2002 translation nào trong module — ĐỪNG thêm** (unique violation → 500 như cũ).
- 2 audit write (`refund.manual_confirmed`, `payment.settings_updated`) — data shape nguyên văn.
- Per-gateway credential zod (contracts) Ở LẠI use-case upsert (zod là boundary; entity cấm import zod).
- Credentials đã giải mã KHÔNG nằm trong state entity nào (spec §5 row 13).
- **Dead code XÓA trong PR này** (§8c): `canSucceed` (giữ `amountMatches` + `publicPaymentStatus`
  trong `payment-status.ts`), `findActivePendingByBooking` (port + repo). Grep 0-consumer trước khi
  xóa, ghi vào report.
- **§4 normalize outbox tenantId**: `payments.module.ts` 6 site `event.tenantId ?? ''`
  (:85,:92,:100,:109,:125,:132) → private `requireTenantId` + `Logger`, copy khuôn
  `affiliate.module.ts:157-170` (skip-with-log, KHÔNG throw). Hành vi handler giữ: business error
  từ UC vẫn propagate → relay retry (không try/catch mới); chiều đổi duy nhất = event thiếu
  tenantId (trước: `forTenant('')` crash + kẹt retry; sau: skip + log).
- Không module nào import code payments (grep 0 hit) → port retype nội bộ tự do, nhưng record
  shapes (`PaymentRecord`, `RefundRecord`, `GatewayConfigRecord`) giữ nguyên vì mapper/read dùng.
- Known gap MỚI ghi §8a ở Task 5 (không sửa): (a) bare-404 không `code` (#15); (b) DB enum
  `PaymentGateway` có `vnpay` nhưng `GatewayKey` TS không có; (c) refund guarded-update trả row
  bất kể guard match (quirk return); (d) `manualReferenceExists` app-level, không DB unique (đã có
  §8b nhắc refunds unique — bổ sung câu reference).

---

### Task 1: Domain errors + shared kernel + xóa dead code

**Files:**
- Create `apps/api/src/shared/domain/errors/booking-not-found.ts` — `BookingNotFound`
  (`BOOKING_NOT_FOUND`, 404, `Booking not found`). Doc: payments dùng cho checkout; booking (#14)
  + finance (#15) migrate site của họ sau. Khuôn theo `tenant-not-found.ts` cùng thư mục.
- Create `apps/api/src/modules/payments/domain/errors/payment-errors.ts`:
  `BookingNotPayable(status: string)` → 400 `` `Booking is ${status}, not awaiting payment` ``;
  `PaymentMethodUnavailable` → 400 `The selected payment method is not enabled for this storefront`;
  `NoActiveGateway` → 400 `Cửa hàng chưa bật cổng thanh toán`;
  `AmountExceedsGatewayLimit` → 400 `Đơn hàng vượt hạn mức thanh toán MoMo (tối đa 50.000.000đ)`;
  `AmountMismatch` → 400 `Paid amount is less than expected`.
- Create `.../errors/refund-errors.ts`: `RefundAmountExceedsPayment` → 400
  `Refund amount exceeds the captured payment`; `RefundNotFound` → 404 `Refund not found`;
  `RefundNotConfirmable(status: string)` → 400 `` `Refund is ${status}` ``;
  `RefundReferenceAlreadyUsed` → 400 `Refund reference has already been used`.
- Create `.../errors/gateway-config-errors.ts`:
  `UnsupportedPaymentMethod(gateway: string, invalid: string[])` → 400
  `` `Cổng ${gateway} không hỗ trợ phương thức: ${invalid.join(', ')}` ``;
  `GatewayConfigNotFound` → 404 `Configure payment credentials before enabling payment methods`.
- Edit `domain/payment-status.ts`: xóa `canSucceed` (giữ nguyên `amountMatches`,
  `publicPaymentStatus` + comment file). Edit `domain/ports/payment-repository.port.ts` +
  `infrastructure/repositories/prisma-payment.repository.ts`: xóa `findActivePendingByBooking`.

Message copy từng byte từ survey §B (VN có dấu, template literal đúng chỗ). Codes so lại file gốc
trước khi viết (đọc use-case tương ứng).

- [ ] **Step 1:** Grep xác nhận `canSucceed` / `findActivePendingByBooking` 0 consumer (ghi output
  vào report). **Step 2:** Viết 4 file error + 2 edit xóa. **Step 3:**
  `pnpm --filter=@booking/api typecheck` + lint exit 0. **Step 4:** Commit
  `feat(payments): domain errors + shared BookingNotFound; xóa canSucceed + findActivePendingByBooking`.

---

### Task 2: Payment aggregate + wire checkout + handle-webhook

**Files:** Create `domain/entities/payment.entity.ts`; edit `checkout.use-case.ts`,
`handle-webhook.use-case.ts`. **0 diff:** `reconciliation.worker.ts`, webhook controller, adapters.

- [ ] **Step 1: `payment.entity.ts`** — static policy methods, KHÔNG rehydrate/transition theo
  status (CAS ở repo — doc comment đầu file giải thích, dẫn spec §2.8 + comment
  handle-webhook:62-66):
  - `static assertPayable(booking: { status: string }): void` — `status !== 'pending_payment'` →
    `BookingNotPayable(booking.status)`.
  - `static plan(booking: { depositAmount: bigint; securityDeposit: bigint; finalAmount: bigint }): { amount: bigint; kind: 'full' | 'deposit' }`
    — `amount = depositAmount + securityDeposit`; `kind = depositAmount >= finalAmount ? 'full' : 'deposit'`.
  - `static assertGatewayAccepts(input: { gatewayKey: GatewayKey; amount: bigint; isProductionEnv: boolean; allowMockPayments: boolean }): void`
    — thứ tự: (1) mock-in-prod → `NoActiveGateway`; (2) `gatewayKey === 'momo' && amount > MOMO_MAX_PAYMENT_VND`
    → `AmountExceedsGatewayLimit`. Import `MOMO_MAX_PAYMENT_VND` từ `../gateway-limits`.
  - `static decideWebhookTransition(event: WebhookEvent): { action: 'ignore' } | { action: 'terminal'; to: 'failed' | 'expired' } | { action: 'try_succeed' }`
    — `refunded` → ignore; `!== 'succeeded'` → terminal (`expired` → 'expired', else 'failed');
    else try_succeed. (Type import từ `../ports/payment-gateway.port` — type-only, framework-free.)
  - `static assertAmountCovers(expected: bigint, paid: bigint): void` — `!amountMatches(expected, paid)`
    → `AmountMismatch`. (Import `amountMatches` từ `../payment-status` — path pure fn giữ nguyên.)
- [ ] **Step 2: `checkout.use-case.ts`** — thay từng throw ĐÚNG VỊ TRÍ hiện tại, thứ tự check
  không dịch chuyển:
  - `:97-102` → `BookingNotFound` (shared kernel); `:103-109` → `Payment.assertPayable(booking)`;
  - `:113-119` → `throw new PaymentMethodUnavailable()` (điều kiện `!routed && configs.length > 0` giữ ở UC);
  - reuse-check `:128-133` giữ nguyên vị trí (TRƯỚC amount/mock/momo);
  - `:135-136` → `const { amount, kind } = Payment.plan(booking)`;
  - `:137` `storefrontOrigin(host)` giữ nguyên vị trí (throw #1 🔒);
  - `:140-159` → `Payment.assertGatewayAccepts({ gatewayKey: gateway.key, amount, isProductionEnv: process.env.NODE_ENV === 'production', allowMockPayments: process.env.ALLOW_MOCK_PAYMENTS === 'true' })`
    (env đọc ở UC — so điều kiện gốc từng ký tự trước khi viết);
  - orderRef/idempotencyKey/create/return giữ nguyên. Throw #1/#2 (`invalidStorefrontHost`,
    `STOREFRONT_SUSPENDED`) KHÔNG đụng.
- [ ] **Step 3: `handle-webhook.use-case.ts`** — `:60-73` thay branch bằng
  `Payment.decideWebhookTransition(v.event)` (ignore → `return false`; terminal →
  `markTerminalIfPending(tx, payment.id, to)` + `return false`); `:74-79` →
  `Payment.assertAmountCovers(payment.amount, v.amountVnd)`; `markSucceeded` + emit + `if (!flipped) return`
  giữ nguyên từng dòng. Throw #8/#9 KHÔNG đụng.
- [ ] **Step 4:** typecheck + lint + build exit 0. **Step 5: Đối chiếu**
  `git diff HEAD -- apps/api/src/modules/payments`: bảng lỗi #3-#7,#10 đúng byte; reuse-check/
  origin/orderRef vị trí không đổi; worker + controller + repo 0 diff; emit payload 0 diff.
  **Step 6:** Commit `refactor(payments): Payment aggregate — checkout + webhook qua entity`.

---

### Task 3: Refund aggregate + wire 3 refund use-case

**Files:** Create `domain/entities/refund.entity.ts`; edit `execute-refund.use-case.ts`,
`execute-automatic-refund.use-case.ts`, `confirm-manual-refund.use-case.ts`. **0 diff:**
`prisma-refund.repository.ts` (lock/guard/`new Date()` completedAt ở lại repo).

- [ ] **Step 1: `refund.entity.ts`**:
  - `RefundPolicyInput` = `{ payment: { id: string; amount: bigint; gateway: GatewayKey; paymentMethod: string | null }; bookingId: string; amount: bigint; reason: string; affectsBookingStatus: boolean; settings: GatewayPaymentSettings; now: Date }`
    (type `GatewayPaymentSettings` import từ `@booking/contracts`).
  - `static plan(input): NewRefund` — (1) `amount > payment.amount` → `RefundAmountExceedsPayment`;
    (2) `automatic = settings.refundStrategy === 'automatic_preferred' && reason !== 'security_deposit' && (isSepayCardFull || isWalletAuto)`
    với `isSepayCardFull = payment.gateway === 'sepay' && payment.paymentMethod === 'CARD' && amount === payment.amount`,
    `isWalletAuto = payment.gateway === 'momo' || payment.gateway === 'zalopay'` — chép ĐÚNG biểu thức
    execute-refund:64-73; (3) `dueAt = automatic ? null : Refund.manualDueAt(settings.manualRefundSlaHours, now)`;
    trả `NewRefund` = `{ paymentId, bookingId, amount, status: automatic ? 'pending' : 'manual_required', affectsBookingStatus, reason, gatewayRefundId: null, executionMode: automatic ? 'automatic' : 'manual', dueAt }`
    (đúng shape `CreateRefundData` hiện tại).
  - `static manualDueAt(slaHours: number, now: Date): Date` — `new Date(now.getTime() + slaHours * 60 * 60 * 1000)`.
  - `static rehydrate(record: RefundRecord)` (state hẹp: id, paymentId, bookingId, status,
    executionMode — chỉ field các method dưới đọc):
    - `canExecuteAutomatically(): boolean` — `status === 'pending' && executionMode === 'automatic'`.
    - `isForPayment(payment: { id: string } | null): boolean` — `payment !== null && payment.id === paymentId`.
    - `classifyConfirmation(): 'already_succeeded' | 'confirmable'` — `status === 'succeeded'` →
      already_succeeded; `!['manual_required','pending'].includes(status)` →
      throw `RefundNotConfirmable(status)`; else confirmable.
- [ ] **Step 2: `execute-refund.use-case.ts`** — `amount <= 0n` return giữ TRƯỚC tx; trong tx:
  lock → exists → findSucceededByBooking (nothing-paid return) giữ nguyên; `:51-88` thay bằng
  `Refund.plan({..., affectsBookingStatus, settings, now: new Date()})` + `refunds.create(tx, tenantId, planned)`;
  default 2 tham số signature (`reason = 'booking_cancellation'`, `affectsBookingStatus = reason !== 'security_deposit'`)
  GIỮ NGUYÊN trong chữ ký `execute()` (outbox handlers gọi positional). Emit ternary
  `refund.execution_requested`/`refund.requested` + payload giữ nguyên văn.
- [ ] **Step 3: `execute-automatic-refund.use-case.ts`** — giữ two-phase nguyên cấu trúc; phase 1
  precondition `:36-40` thay bằng rehydrate + `canExecuteAutomatically()` + `isForPayment(payment)`
  (đúng cả 2 điều kiện, return null như cũ); provider call + reference fallback +
  `reconciled:void` retry-safety giữ ở UC nguyên văn; phase 2 re-check `:76-77` dùng lại
  `canExecuteAutomatically()` (KHÔNG thêm payment re-match — hiện không có); dueAt downgrade `:97`
  → `Refund.manualDueAt(prepared.manualRefundSlaHours, new Date())`; 2 emit giữ nguyên văn.
- [ ] **Step 4: `confirm-manual-refund.use-case.ts`** — `:29-36` → `RefundNotFound`; lock +
  re-read giữ; `:39-46` → `classifyConfirmation()` ('already_succeeded' → `return found` giữ);
  `:47-53` → `RefundReferenceAlreadyUsed`; **`:55` bare `NotFoundException()` GIỮ NGUYÊN**
  (🔒 #15); audit write + emit + return giữ nguyên văn.
- [ ] **Step 5:** typecheck + lint + build exit 0. **Step 6: Đối chiếu** diff: biểu thức automatic
  đúng từng toán tử; dueAt vẫn app-clock; repo 0 diff; 4 emit site payload/eventType/thứ tự 0
  diff; chữ ký `execute()` + default giữ nguyên. **Step 7:** Commit
  `refactor(payments): Refund aggregate — plan/two-phase/confirm qua entity`.

---

### Task 4: TenantGatewayConfigs (thin) + config use-cases + outbox normalize

**Files:** Create `domain/entities/tenant-gateway-configs.entity.ts`; edit
`update-gateway-payment-settings.use-case.ts`, `payments.module.ts`. **0 diff:**
`upsert-gateway-config.use-case.ts` (zod boundary giữ — không có gì chuyển),
`deactivate-gateway.use-case.ts`, `prisma-gateway-config.repository.ts`, mapper, controllers.

- [ ] **Step 1: `tenant-gateway-configs.entity.ts`** — thin set-aggregate, static-only:
  - `static assertMethodsSupported(gateway: GatewayKey, enabledMethods: readonly CustomerPaymentMethod[]): void`
    — `supported = GATEWAY_SUPPORTED_METHODS[gateway]`; `invalid = enabledMethods.filter(m => !supported.includes(m))`;
    `invalid.length > 0` → `UnsupportedPaymentMethod(gateway, invalid)` (join `', '` trong error class,
    đúng message template). Import `GATEWAY_SUPPORTED_METHODS` type-safe từ `@booking/contracts`.
  - Doc comment đầu file: invariant **grouped single-active** (1 BASE active tenant-wide; mỗi wallet
    single-active riêng) được thực thi TRONG `PrismaGatewayConfigRepository.upsert`
    (updateMany-then-upsert, 1 tx) theo luật CAS-ở-repo — entity phát biểu, không tái thực thi;
    credential zod ở UC (boundary); `pickConfigForMethod` là pure fn routing, giữ nguyên chỗ.
- [ ] **Step 2: `update-gateway-payment-settings.use-case.ts`** — `:31-39` →
  `TenantGatewayConfigs.assertMethodsSupported(input.gateway, input.enabledMethods)`; `:45-51` →
  `throw new GatewayConfigNotFound()`; audit + return giữ nguyên.
- [ ] **Step 3: `payments.module.ts`** — private `requireTenantId(eventType, tenantId): string | null`
  + `private readonly logger = new Logger(PaymentsModule.name)`, copy khuôn + doc comment
  `affiliate.module.ts:157-170`; 6 handler: lấy tenantId trước, `null` → `return`, rồi gọi UC như
  cũ. `BigInt(...)` parse + tham số positional giữ nguyên văn. KHÔNG try/catch mới.
- [ ] **Step 4:** typecheck + lint + build exit 0. Đối chiếu: message #17 đúng từng byte VN;
  #18 đúng; module chỉ khác requireTenantId; upsert/deactivate 0 diff. **Step 5:** Commit
  `refactor(payments): TenantGatewayConfigs thin aggregate + outbox tenantId skip-with-log`.

---

### Task 5: Docs + verify + smoke + PR

- [ ] **Step 1: Docs**
  - Spec §8a thêm 4 known gap mới (bare-404 no-code; `vnpay` DB-enum vs `GatewayKey`; refund
    guarded-update return-quirk; manual reference app-level unique — câu bổ sung cạnh mục §8b
    refunds) — đều "giữ nguyên ở PR #13".
  - Spec §8c: đánh dấu `canSucceed` + `findActivePendingByBooking` **[ĐÃ XOÁ ở PR #13]**;
    §8c-bis mục 9: bỏ payments khỏi danh sách `?? ''`.
  - `docs/refactor/HANDOFF.md` §1: row `| 13 | payments | 🔍 review (PR #NN) |` + cập nhật "Việc
    kế tiếp" (đợt 2: booking #14 + finance #15 + administrative-division #16); §7 bỏ payments khỏi
    danh sách `?? ''`.
  - `apps/api/CLAUDE.md`: thêm payments vào danh sách module đã refactor.
  - (Conflict với track scheduling ở các file docs này là dự kiến — PR nào merge sau rebase sửa.)
- [ ] **Step 2:** Trong worktree: `pnpm turbo lint typecheck build` exit 0 +
  `pnpm --filter=@booking/api check:rls` xanh.
- [ ] **Step 3:** Boot API worktree `PORT=3002 pnpm --filter=@booking/api dev` (DB/redis chung với
  tree chính — không migrate/seed lại; kill khi xong).
- [ ] **Step 4: Smoke** (headless; storefront host `localhost` → tenant StudioHub; login
  `owner@studiohub.vn` + `x-tenant-id` cho config/refund; customer `customer@studiohub.vn` cho
  booking; psql `docker compose exec -T postgres psql -U postgres -d booking`; **tự tạo data, dọn
  sạch**):
  1. **Checkout mock trọn vòng**: tạo booking storefront (listing published bất kỳ) →
     `POST /public/bookings/:id/checkout {paymentMethod}` → 201 `{paymentId, destination}`; gọi lại
     lần 2 → CÙNG paymentId (reuse pending, không row mới — psql count). Mock webhook succeed
     (`POST /webhooks/mock`, ký `MOCK_WEBHOOK_SECRET` theo mock adapter) → 200 `{success:true}`;
     psql: payment `succeeded`, `paid_at` set; outbox có `payment.succeeded {paymentId, bookingId}`;
     booking sang `confirmed` (consumer chạy).
  2. **Webhook lỗi**: body rỗng → 400 `EMPTY_BODY`; chữ ký sai → 401
     `{statusCode:401, code:"INVALID_SIGNATURE", message:"Webhook signature invalid"}` (so byte);
     replay webhook succeed lần 2 → 200 ack, không emit trùng (`markSucceeded` CAS false — psql
     outbox count không tăng).
  3. **Checkout guard**: booking đã confirmed → 400 `BOOKING_NOT_PAYABLE` message
     `Booking is confirmed, not awaiting payment`; bookingId uuid lạ → 404 `BOOKING_NOT_FOUND`.
  4. **AMOUNT_MISMATCH**: webhook mock amount thấp hơn → 400 `AMOUNT_MISMATCH`; psql payment vẫn
     pending.
  5. **Refund manual flow**: cancel booking đã confirm (đường storefront/dashboard có refund_due)
     → outbox `booking.cancelled` → psql refunds có row `manual_required`, `due_at` ≈ now+SLA,
     reason `booking_cancellation`; outbox `refund.requested` payload đủ 6 key. Replay: emit lại
     `booking.cancelled` không tạo refund thứ 2 (advisory lock + exists — psql count = 1).
  6. **Confirm manual refund**: `POST /tenant/payments/refunds/:id/confirm {reference}` → 201
     body `toRefundResponse` (status succeeded, completedAt set); gọi LẠI cùng refund → 201
     idempotent (body succeeded, không đổi); reference đã dùng cho refund khác → 400
     `REFUND_REFERENCE_ALREADY_USED`; refund id lạ → 404 `REFUND_NOT_FOUND`; psql outbox
     `refund.completed` + audit_logs `refund.manual_confirmed`.
  7. **Gateway config**: PUT config momo sandbox (creds giả đúng shape) → 200, psql row isActive,
     creds mã hoá (`{"enc":...}`); PUT settings enabledMethods có method momo không hỗ trợ → 400
     `UNSUPPORTED_PAYMENT_METHOD` message VN đúng byte (`Cổng momo không hỗ trợ phương thức: …`);
     PUT settings khi chưa có config active của gateway đó → 404 `GATEWAY_CONFIG_NOT_FOUND`;
     creds sai shape → 400 `INVALID_GATEWAY_CONFIG` có `details`; DELETE → 204; khôi phục config
     gốc (nếu có) / xoá row test.
  8. **Regression đọc**: GET `/public/payment-options` → 200; GET payment-status theo bookingCode
     → 200 shape cũ; GET tenant payments/refunds list → 200.
  Case không dựng được headless (vd BullMQ reconcile loop, refund automatic cần gateway thật) →
  ghi rõ trong PR body là chưa verify runtime, kèm lý do.
- [ ] **Step 5:** Ghi `.superpowers/sdd/progress.md` (của worktree); commit docs; push
  `refactor/entity-payments`; `gh pr create --base refactor/entity-centric` — body: 8 write UC qua
  3 aggregate, bảng 22 throw (✎/🔒), 9 emit payload đóng băng + consumer key, CAS/lock/two-phase
  giữ nguyên (điểm reviewer phải soi — spec §2.8), dead code đã xoá, outbox `?? ''` → skip-with-log
  (6 site, bảng hành vi handler trước/sau), worker + adapters + read-side 0 diff, 4 known gap mới
  ghi §8a, kết quả smoke từng case + phần chưa verify được.
- [ ] **Step 6:** Báo controller — **KHÔNG merge** (quyết định owner).
