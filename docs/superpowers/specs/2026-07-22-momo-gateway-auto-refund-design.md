# MoMo Gateway + Auto-refund về ví MoMo — Design

> Ngày: 2026-07-22 · Branch: `feat/momo-gateway` → **ĐÃ MERGE vào `main`** (origin a4c48ee)
> Trạng thái: **IMPLEMENTED & MERGED** (verify typecheck+lint+build xanh; CHƯA e2e sandbox thật)
> Liên quan: `apps/api/src/modules/payments`, `apps/api/src/modules/finance`, `apps/dashboard`, `apps/storefront`, `packages/contracts`

---

## ⚠️ Cập nhật sau merge (code hiện tại khác một số mô tả bên dưới)

Lúc merge, `main` đã có sẵn kiến trúc payment mới (`bdeaa5d`) — MoMo được **re-fit** vào đó. Những chỗ dưới đây là **nguồn sự thật**, đè lên phần thiết kế cũ ở §2–§9:

1. **Refund là two-phase** (không còn `ExecuteRefundUseCase` tự gọi gateway):
   `booking.cancelled` → `ExecuteRefundUseCase` tạo **refund row** (`executionMode` automatic/manual, `dueAt`) rồi emit `refund.execution_requested` (automatic) / `refund.requested` (manual) → **`ExecuteAutomaticRefundUseCase`** mới gọi `gateway.refund(...)`. Retry khi lỗi = redeliver `refund.execution_requested`.
2. **MoMo auto-refund tiền đơn** khi `refundStrategy = automatic_preferred` — cho **cả refund một phần** (chính sách huỷ). **Tiền cọc (`security_deposit`) KHÔNG auto** — về manual, **giống SePay**. (SePay còn chỉ auto khi thẻ `CARD` + full.)
3. **Port mới**: `RefundInput = { gatewayTxnId, gatewayOrderRef, amountVnd, reason }` — **bỏ `idempotencyKey`**; MoMo adapter derive requestId deterministic từ `` `${gatewayOrderRef}:${reason}` ``. Adapter thêm `providerPaymentMethod(method) → 'MOMO_WALLET'`; `createPayment` nhận `paymentMethod` (bỏ qua) và trả `paymentMethod: 'MOMO_WALLET'`. `WebhookEvent`/`PaymentStatusResult` thêm `'refunded'`.
4. **Config gateway có thêm `settings`** (`enabledMethods`, `refundStrategy`, `manualRefundSlaHours`); checkout nhận `paymentMethod: CustomerPaymentMethod` và validate theo `enabledMethods`. `gatewayConfigResponseSchema` mang cả `settings` (origin) lẫn `partnerCode` (momo).
5. **Dashboard**: payments tab render **cả** `PaymentGatewayCard` (selector SePay/MoMo/Tắt — **single-active**) **lẫn** `PaymentMethodSettingsCard` (cấu hình methods + refundStrategy cho cổng đang active). RefundsPanel nhãn trung tính **Tự động / Thủ công** (không gán tên gateway).
6. **Vẫn giữ**: guard `NO_ACTIVE_GATEWAY` + cap MoMo 50tr ở checkout; persist `transId` qua webhook + reconciliation; custody+clawback (không thêm ledger leg).

**Follow-up UX**: `customerPaymentMethod` chưa có `momo_wallet` → khi cổng active là MoMo, khách chọn method nào cũng ra MoMo redirect.

### Cập nhật tiếp theo — ZaloPay song song (2026-07-22)

Model single-active ở trên đã đổi thành **grouped-active**: mỗi tenant có **1 cổng BASE** (SePay/PayOS,
như cũ) **+ tối đa 2 ví song song** (MoMo, ZaloPay) bật/tắt độc lập — không còn loại trừ lẫn nhau.
ZaloPay dùng **chung pipeline auto-refund** ở trên (không có use-case refund riêng), chỉ khác adapter:
`ZalopayGatewayAdapter.refund()` là **async** — query-before-refund với `m_refund_id` deterministic
theo ngày VN (check cả hôm nay lẫn hôm qua để an toàn qua nửa đêm), `return_code 3` (đang xử lý) thì
poll ngắn rồi throw để redeliver qua outbox. Method `zalopay_wallet` map 1:1 với cổng `zalopay` (không
đi qua `enabledMethods` như MoMo/BASE). Hai điểm còn cần **verify sandbox thật** trước khi bật prod:
origin thật của `order_url` (đang đoán `sbgateway.zalopay.vn`/`gateway.zalopay.vn` cho
`PAYMENT_REDIRECT_ORIGINS`) và giới hạn số ngày ZaloPay còn cho phép gọi `/v2/refund` sau khi thanh toán.

---

## 1. Mục tiêu & phạm vi

Tích hợp cổng thanh toán **MoMo** (ví điện tử VN) vào BookingOS với **hoàn tiền tự động về ví MoMo** khi huỷ booking.

MoMo là **gateway "thật" đầu tiên có `refund().supported === true`** — nghĩa là nó khớp đúng khe mà pipeline auto-refund hiện có (`ExecuteRefundUseCase`) đã chừa sẵn cho SePay/PayOS (2 cổng này trả `supported:false` → refund rơi vào `manual_required`, tenant chuyển khoản tay). Với MoMo, refund chạy tự động end-to-end **mà không cần use-case refund mới**.

### Quyết định thiết kế đã chốt
| # | Quyết định | Chọn |
|---|-----------|------|
| 1 | Model chọn cổng ở tenant settings | **Single-active**: SePay / MoMo / **Tắt** (giữ cờ `isActive` hiện có) |
| 2 | Sản phẩm thanh toán MoMo | **AIO `captureWallet` (redirect)** — dùng variant `destination.redirect` sẵn có |
| 3 | Ghi sổ kế toán refund | **Giữ custody + clawback** (không thêm ledger leg `refund`) |

### Ngoài phạm vi (KHÔNG làm ở bản này)
- Ledger leg cash-out `refund` riêng (giữ cơ chế clawback hiện tại).
- Multi-gateway đồng thời + khách chọn phương thức lúc checkout (giữ single-active).
- Hiển thị QR nhúng trên storefront (dùng redirect sang trang MoMo; MoMo tự lo QR + deeplink app).
- Nút "Thử lại" refund thủ công cho refund `failed` (xem §9 — dựa vào reconciliation worker tự re-drive).
- Tách lệnh refund cho booking > 50.000.000đ — **không cần**: checkout chặn đơn MoMo quá hạn mức (xem §8).
- Hoàn tiền cho các cổng khác (VNPay… — DB enum có `vnpay` nhưng không đụng).

### Tuân thủ hard rules dự án
- **KHÔNG test** (ADR 0005). Verify = `typecheck` + `lint` + `build` + chạy app.
- Backend `controller → use-case → repository-port → repository`, **không service class**; 1 use-case = 1 file (ADR 0006).
- Module giao tiếp qua **outbox**, không import chéo.
- Tiền = `bigint` VND; thời gian = `timestamptz` UTC.
- Frontend không fetch backend từ browser — qua RR `loader`/`action` + `@booking/api-client`.

---

## 2. Hiện trạng (đã verify bằng code)

Pipeline cancel → refund đã chạy đủ 3 module qua outbox:

```
booking.cancel-booking.use-case
  refundAmount = computeRefund(paidAmount, policy%) + securityDeposit
  emit outbox booking.cancelled { refundAmount, refundPercent }
        │
        ├─(payments.module.ts:76) ExecuteRefundUseCase.execute(tenantId, bookingId, amount, 'booking_cancellation')
        │     lockForBooking + existsForBooking(bookingId, reason)   ← idempotency DB
        │     payment = findSucceededByBooking(bookingId)
        │     gateway = registry.resolveForTenant(tx, tenantId, payment.gateway)
        │     res = gateway.refund({ gatewayTxnId, amountVnd, reason })
        │     supported → refund row 'succeeded' + emit refund.completed
        │     !supported → refund row 'manual_required' + emit refund.requested
        │
        └─(finance.module.ts) prepareRefund / clawback
  refund.completed →(booking.module.ts:99) FinalizeRefundedBookingUseCase → booking = 'refunded'
```

### Các interface sống-còn (đã verify — `payment-gateway.port.ts`)
```ts
interface CreatePaymentInput {                      // caller TỰ mint orderCode, truyền vào
  amountVnd: bigint; orderCode: string; description: string;
  returnUrl: string; errorUrl: string; cancelUrl: string; expiresInSec: number;
}
interface CreatePaymentResult {
  destination: CheckoutDestination;                 // URL nằm ở đây, KHÔNG top-level
  gatewayTxnId?: string; gatewayOrderRef?: string;
}
interface WebhookVerification {
  valid: boolean; event: WebhookEvent;
  gatewayTxnId: string;                             // ← persist vào payment.gateway_txn_id
  gatewayOrderRef?: string; gatewayOrderId?: string;
  paymentMethod?: string; amountVnd: bigint;
}
interface RefundInput  { gatewayTxnId: string; amountVnd: bigint; reason: string; }   // + idempotencyKey (mới)
interface RefundResult { supported: boolean; refundId?: string; }
interface PaymentStatusResult { status: 'pending'|'succeeded'|'failed'|'expired'; amountVnd: bigint; } // + gatewayTxnId? (mới)

// PaymentGatewayPort
createPayment(input): Promise<CreatePaymentResult>;
peekReference(rawBody): string | null;               // creds-free, tách reference tìm tenant
verifyWebhook(rawBody, ...): WebhookVerification;     // có creds, verify chữ ký
refund(input): Promise<RefundResult>;
queryPaymentStatus(reference): Promise<PaymentStatusResult>;
```

```ts
// CheckoutDestination (packages/contracts/src/contracts/payment.ts) — MoMo dùng variant 'redirect'
type CheckoutDestination =
  | { type: 'redirect'; paymentUrl: string }
  | { type: 'form_post'; actionUrl: string; fields: Record<string,string> };
```

### Điểm verify quan trọng
- **Lookup lúc IPN CHẠY**: `findByGatewayReference(gateway, ref)` khớp `OR: [{gatewayOrderRef: ref}, {gatewayTxnId: ref}]` (`prisma-payment.repository.ts:146-154`). MoMo IPN echo lại `orderId` (= orderCode ta mint, lưu ở `gateway_order_ref`) → tìm được payment **dù `gateway_txn_id` còn null**. Không sửa repo.
- **transId được persist**: `markSucceeded(tx, id, payload, {gatewayTxnId, gatewayOrderId, paymentMethod})` ghi `gateway_txn_id = COALESCE(?, gateway_txn_id)` (`handle-webhook.use-case.ts:77-90`). MoMo adapter chỉ cần trả `WebhookVerification.gatewayTxnId = <transId>`.
- **Reconciliation** truyền `p.gatewayOrderRef ?? p.gatewayTxnId` cho `queryPaymentStatus` (`reconciliation.worker.ts:57-66`) → với pending MoMo (chưa có IPN) sẽ là `orderRef` (orderId). Adapter query MoMo bằng `orderId`.
- **Config**: `TenantGatewayConfig` unique `(tenantId, gateway, environment)`, cờ `isActive`. Upsert tự tắt các config active khác (`updateMany isActive:false` rồi upsert `isActive:true`) → single-active. **Chưa có** endpoint disable. Creds = 1 blob AES-GCM dưới `credentials.enc` (key env `PAYMENTS_ENC_KEY`).
- **DB enum** `PaymentGateway` đã có sẵn `momo` (`schema.prisma:202-210`). App-layer `GatewayKey = 'sepay'|'payos'|'mock'` **chưa** có momo.

---

## 3. Backend — MomoGatewayAdapter

File mới: `apps/api/src/modules/payments/infrastructure/gateways/momo-gateway.adapter.ts`, implement `PaymentGatewayPort`.
Theo pattern PayOS: `fetch` trực tiếp + HMAC-SHA256, **không** SDK.

**Credentials** (giải mã từ `TenantGatewayConfig.credentials`): `{ partnerCode, accessKey, secretKey }`.
**Base URL theo environment**: `sandbox` → `https://test-payment.momo.vn`, `production` → `https://payment.momo.vn`.

### 3.1 `createPayment` → `POST {base}/v2/gateway/api/create`
Request (`requestType: 'captureWallet'`):
```jsonc
{
  "partnerCode": "<partnerCode>",
  "requestId":   "<orderCode>",              // reuse orderCode làm requestId create (đơn giản, unique)
  "orderId":     "<orderCode>",              // = input.orderCode (BKF-…) do checkout mint
  "amount":      <amountVnd>,                // number VND
  "orderInfo":   "<input.description>",
  "redirectUrl": "<input.returnUrl>",
  "ipnUrl":      "<PUBLIC_API_URL>/webhooks/momo",
  "requestType": "captureWallet",
  "extraData":   "",                         // base64 rỗng
  "orderExpireTime": <ceil(input.expiresInSec/60)>,   // MoMo tính phút; 900s → 15
  "lang":        "vi",
  "autoCapture": true,
  "signature":   "<hmacSHA256(rawCreate, secretKey)>"
}
```
Raw chữ ký create (thứ tự cố định — **không** đổi):
```
accessKey=$accessKey&amount=$amount&extraData=$extraData&ipnUrl=$ipnUrl&orderId=$orderId&orderInfo=$orderInfo&partnerCode=$partnerCode&redirectUrl=$redirectUrl&requestId=$requestId&requestType=$requestType
```
Response (resultCode `0` = OK): `{ payUrl, deeplink, qrCodeUrl, resultCode, message, ... }`.
Trả về:
```ts
return {
  destination: { type: 'redirect', paymentUrl: json.payUrl },
  // gatewayTxnId: undefined  → MoMo chưa có transId lúc create (chỉ có ở IPN)
  // gatewayOrderRef: undefined → checkout fallback về orderCode, lưu gateway_order_ref
};
```
`resultCode !== 0` → throw `BadGateway` (checkout báo lỗi rõ ràng).

### 3.2 `peekReference(rawBody)` — creds-free
Parse JSON IPN body → trả `orderId` (string) hoặc `null`. (Đây là orderCode ta mint → `findByGatewayReference` khớp `gateway_order_ref`.)

### 3.3 `verifyWebhook(rawBody, creds)` → `WebhookVerification`
1. Parse IPN body. Verify chữ ký:
   ```
   accessKey=$accessKey&amount=$amount&extraData=$extraData&message=$message&orderId=$orderId&orderInfo=$orderInfo&orderType=$orderType&partnerCode=$partnerCode&payType=$payType&requestId=$requestId&responseTime=$responseTime&resultCode=$resultCode&transId=$transId
   ```
   HMAC-SHA256 với `secretKey`, so khớp field `signature`. Sai → `{ valid: false }`.
2. Map:
   ```ts
   return {
     valid: true,
     event: resultCode === 0 ? 'succeeded' : 'failed',
     gatewayTxnId: String(body.transId),   // ← CỐT LÕI: transId để refund sau này
     gatewayOrderRef: body.orderId,
     paymentMethod: 'MOMO_WALLET',
     amountVnd: BigInt(body.amount),
   };
   ```
`HandleWebhookUseCase` (sẵn có) sẽ verify amount + `markSucceeded` (persist transId) + emit `payment.succeeded`. **Không đụng use-case này.**

### 3.4 `refund(input)` → `POST {base}/v2/gateway/api/refund`
`input`: `{ gatewayTxnId, amountVnd, reason, idempotencyKey }` (idempotencyKey = field MỚI, xem §4).
Request:
```jsonc
{
  "partnerCode": "<partnerCode>",
  "orderId":     "<idempotencyKey>",         // deterministic: `${bookingId}:${reason}`
  "requestId":   "<idempotencyKey>",         // deterministic → MoMo idempotent khi retry
  "amount":      <amountVnd>,
  "transId":     <Number(gatewayTxnId)>,     // transId GỐC của giao dịch thanh toán
  "lang":        "vi",
  "description": "<reason>",
  "signature":   "<hmacSHA256(rawRefund, secretKey)>"
}
```
Raw chữ ký refund:
```
accessKey=$accessKey&amount=$amount&description=$description&orderId=$orderId&partnerCode=$partnerCode&requestId=$requestId&transId=$transId
```
- `resultCode === 0` → `return { supported: true, refundId: String(json.transId) }` (transId của lệnh hoàn → lưu `Refund.gatewayRefundId`).
- Lỗi (resultCode ≠ 0 / network) → **throw** (KHÔNG trả `supported:false`). Lý do: `supported:false` sẽ đánh dấu `manual_required` (sai với MoMo). Throw → `ExecuteRefundUseCase` không ghi row → reconciliation worker tự re-drive (xem §9). Vì `requestId` deterministic, retry an toàn kể cả khi lần trước MoMo đã hoàn thành công (mất response).
- HTTP timeout gọi API refund **≥ 30s** (yêu cầu MoMo).

### 3.5 `queryPaymentStatus(reference)` → `POST {base}/v2/gateway/api/query`
`reference` là `orderId` (từ reconciliation, xem §2). Request `{ partnerCode, orderId: reference, requestId: <sinh mới>, lang, signature }`, raw:
```
accessKey=$accessKey&orderId=$orderId&partnerCode=$partnerCode&requestId=$requestId
```
Map `resultCode`: `0` → `succeeded`; pending code → `pending`; hết hạn → `expired`; còn lại → `failed`. **Trả kèm `gatewayTxnId: String(json.transId)`** (field mới ở `PaymentStatusResult`, xem §4) để payment phục hồi qua reconciliation vẫn refund được.

---

## 4. Backend — thay đổi contract & field bổ sung

| Thay đổi | File |
|---|---|
| `GatewayKey` union += `'momo'` | `payments/domain/ports/payment-gateway.port.ts:9` |
| `gatewayKeySchema` += `'momo'` (rồi rebuild contracts → dist) | `packages/contracts/src/contracts/payment.ts:4` |
| `momoGatewayConfigInputSchema = z.object({ partnerCode, accessKey, secretKey })` | `packages/contracts/.../payment.ts` |
| `RefundInput` += `idempotencyKey: string` | `payment-gateway.port.ts:38` |
| `PaymentStatusResult` += `gatewayTxnId?: string` | `payment-gateway.port.ts:50` |

**`ExecuteRefundUseCase`** (`execute-refund.use-case.ts:50-55`): thêm `idempotencyKey: \`${bookingId}:${reason}\`` vào lời gọi `gateway.refund(...)`. `bookingId` đã có sẵn ở scope. SePay/PayOS/mock bỏ qua field này.

**Reconciliation worker**: khi `queryPaymentStatus` trả `succeeded` + `gatewayTxnId`, truyền `gatewayTxnId` vào `markSucceeded` để persist transId trên đường phục hồi. *(Verify tại lúc code: xác nhận worker gọi `markSucceeded` chứ không chỉ re-emit event; nếu chỉ emit thì bổ sung persist.)*

**`UpsertGatewayConfigUseCase`** (`upsert-gateway-config.use-case.ts:20-32`): thêm nhánh `gateway === 'momo'` → validate `momoGatewayConfigInputSchema` (song song nhánh `sepay` hiện có). Non-validated branch giữ nguyên cho mock.

**`GatewayRegistry`** (`gateway-registry.ts`): thêm case `momo` ở cả `statelessByKey('momo')` (creds-free, cho `peekReference`) và `resolveForTenant` (bind creds đã giải mã) → khởi tạo `MomoGatewayAdapter`.

---

## 5. Backend — Tắt gateway (endpoint mới)

Yêu cầu "hoặc Tắt tuỳ user" → cần deactivate (hiện chỉ có upsert, luôn set `isActive:true`).

- **Route mới**: `DELETE /tenant/gateway-config` — `@RequirePermissions('tenant.settings.manage')` — `tenant-gateway.controller.ts`.
- **Use-case mới**: `DeactivateGatewayUseCase` (1 file, 1 `execute()`) → repo `deactivateAll(tx, tenantId)` = `updateMany({ where: { tenantId, isActive: true }, data: { isActive: false } })`.
- **Guard checkout khi tắt**: `resolveForTenant` khi không có active config đang fallback về `mock`. Bổ sung: nếu **production** và không có active gateway và **không** bật `ALLOW_MOCK_PAYMENTS` → `CheckoutUseCase` ném lỗi rõ ràng (`code: 'NO_ACTIVE_GATEWAY'`, message "Tenant chưa bật cổng thanh toán") thay vì âm thầm dùng mock. Dev vẫn cho mock như cũ.

---

## 6. Backend — config & webhook

- **Webhook controller** (`webhook.controller.ts`): route `POST /webhooks/:gateway` đã generic → chỉ cần `momo` có trong `gatewayKeySchema`. **Giữ HTTP 200** — MoMo chấp nhận 2xx (không bắt buộc 204). Không đổi controller.
- **`.env` / config**: thêm origin MoMo (`test-payment.momo.vn`, `payment.momo.vn`) vào `PAYMENT_REDIRECT_ORIGINS`. Cần biến `PUBLIC_API_URL` (đã có?) để dựng `ipnUrl` tuyệt đối gửi MoMo. Không đặt secret MoMo vào env (per-tenant, mã hoá trong DB).
- **`paymentMethod`**: đặt `'MOMO_WALLET'` cho payment MoMo (ở `verifyWebhook`).

---

## 7. Frontend — Dashboard

### 7.1 Settings › Thanh toán — selector 3 lựa chọn
`apps/dashboard/app/routes/tenant/settings.tsx` + `features/tenant/`:

- **Loader**: giữ `apiGet('/tenant/gateway-config')` → trả active config `{ gateway, environment, isActive, merchantId? }` hoặc `null`.
- **UI** (thay `SepayGatewayCard` đơn lẻ):
  - Selector (radio): **SePay** / **MoMo** / **Tắt**, default theo `gatewayConfig?.gateway ?? 'off'`.
  - Chọn SePay → `SepayGatewayCard` (giữ nguyên: environment, merchantId, secretKey).
  - Chọn MoMo → `MomoGatewayCard` (mới): environment (Sandbox/Production radio), `partnerCode` (text), `accessKey` (password), `secretKey` (password), Alert trạng thái "Đang hoạt động · {env} · {partnerCode}", hướng dẫn set **IPN URL** = `{PUBLIC_API_URL}/webhooks/momo` trong MoMo Business.
  - Chọn Tắt → nút "Tắt cổng thanh toán" (confirm) → `DELETE`.
- **Action** (`settings-actions.server.ts`): phân nhánh theo `gateway`:
  - `sepay` → `apiPut('/tenant/gateway-config', { gateway:'sepay', environment, credentials:{ merchantId, secretKey } })` (như cũ).
  - `momo` → validate `momoGatewaySettingsFormSchema` → `apiPut('/tenant/gateway-config', { gateway:'momo', environment, credentials:{ partnerCode, accessKey, secretKey } })`.
  - `off` → `apiDelete('/tenant/gateway-config')`.
- Secret/accessKey **không** hiển thị lại (defaultValue rỗng), giống secretKey SePay.

### 7.2 RefundsPanel — UI phù hợp luồng refund
`apps/dashboard/app/features/payments/components/refunds-panel.tsx` (`routes/tenant/finance/transactions.tsx`):

- **Nhãn phương thức** mỗi refund: *Tự động (MoMo)* nếu `gatewayRefundId` có / gateway momo; *Thủ công (SePay)* nếu `manual_required`.
- Trạng thái:
  - `succeeded` **auto (MoMo)**: badge "Đã hoàn về ví MoMo" + mã giao dịch hoàn (`gatewayRefundId`) + thời gian. **Không** form tay.
  - `manual_required` **(SePay)**: giữ form xác nhận tay hiện có (`reference`, `evidenceKey`, `note` → `POST .../refunds/:id/confirm`).
  - `succeeded` (đã confirm tay): hiện reference đã lưu (như cũ).
- **Dòng tổng** đầu panel: "Đã hoàn: {formatVnd} · Đang xử lý: N".
- `failed` **không** hiển thị ở MVP (adapter throw → không ghi row; xem §9). Header panel ghi chú ngắn: "Hoàn MoMo tự động về ví; hoàn SePay cần xác nhận chuyển khoản tay."

---

## 8. Frontend — Storefront (nhẹ)

- `payment-status` route: đã có `GET /public/bookings/:code/payment-status`. Xử lý query `?payment=success|error|cancel` từ MoMo redirect + poll trạng thái tới khi `succeeded/expired`.
- Booking detail (customer): khi refund `succeeded` với gateway momo → hiển thị "Đã hoàn {amount}đ về ví MoMo · {thời gian}".
- **Giới hạn (đã enforce)**: MoMo 1 lệnh **1.000đ – 50.000.000đ**. `CheckoutUseCase` **chặn** đơn MoMo có `amount > 50.000.000đ` (`AMOUNT_EXCEEDS_GATEWAY_LIMIT`) → mọi đơn MoMo luôn hoàn tự động được (refund ≤ amount ≤ hạn mức), không cần tách lệnh. Hằng số dùng chung ở `domain/gateway-limits.ts`.

---

## 9. Xử lý lỗi & idempotency

| Tình huống | Hành vi |
|---|---|
| Double cancel / double event | `lockForBooking` + `existsForBooking(bookingId, reason)` chặn (DB layer, sẵn có). |
| Retry gọi MoMo refund (mất response) | `requestId` = `${bookingId}:${reason}` deterministic → MoMo idempotent, không hoàn 2 lần. |
| MoMo refund lỗi tạm thời | adapter **throw** → không ghi refund row → reconciliation `findBookingsMissingRefund` (30s/lần) re-emit `refund.recovery_requested` → `ExecuteRefundUseCase` chạy lại. |
| Mất IPN thanh toán | reconciliation `findStalePending` → `queryPaymentStatus(orderId)` → `succeeded` + persist `transId` → emit `payment.succeeded`. |
| Chữ ký IPN sai | `verifyWebhook` trả `valid:false` → 400 `BAD_WEBHOOK`. |
| Không có active gateway (prod, mock off) | `CheckoutUseCase` throw `NO_ACTIVE_GATEWAY`. |

**Hạn chế đã biết (follow-up, ngoài phạm vi):**
1. Refund MoMo **hỏng vĩnh viễn** (vd transId sai) sẽ bị worker retry lặp lại mỗi 30s và **không** hiện trong RefundsPanel (không có row). Follow-up: sau N lần persist row `failed` + cho tenant chuyển sang hoàn thủ công (tái dùng `ConfirmManualRefundUseCase`). *(Trường hợp > 50tr đã loại bỏ ở checkout — xem §8.)*
2. Reuse pending checkout có thể trả `payUrl` MoMo đã hết hạn (~15’). Khách chờ payment `expired` rồi checkout lại (giống PayOS hiện tại).

---

## 10. Sổ kế toán (không đổi)

`refund.completed` → `finance.module.ts`: `FinalizeSettlementRefundUseCase` (custody `refundedAmount += x`) + `RecordClawbackJournalUseCase` (đảo revenue journal). Entry type `refund` vẫn **không** phát leg. MoMo chỉ khác ở chỗ tiền ra ví khách tự động qua API — luồng ghi sổ y hệt SePay manual.

---

## 11. Danh sách file (impl checklist — plan chi tiết ở bước writing-plans)

**Backend**
- [ ] `payments/infrastructure/gateways/momo-gateway.adapter.ts` (mới)
- [ ] `payments/infrastructure/gateway-registry.ts` (+ case momo × 2)
- [ ] `payments/domain/ports/payment-gateway.port.ts` (GatewayKey += momo; RefundInput.idempotencyKey; PaymentStatusResult.gatewayTxnId)
- [ ] `payments/application/use-cases/execute-refund.use-case.ts` (truyền idempotencyKey)
- [ ] `payments/application/use-cases/deactivate-gateway.use-case.ts` (mới) + repo `deactivateAll`
- [ ] `payments/application/use-cases/checkout.use-case.ts` (guard NO_ACTIVE_GATEWAY)
- [ ] `payments/application/use-cases/upsert-gateway-config.use-case.ts` (nhánh validate momo)
- [ ] `payments/infrastructure/reconciliation.worker.ts` (persist gatewayTxnId khi phục hồi)
- [ ] `payments/.../tenant-gateway.controller.ts` (DELETE route)
- [ ] `.env.example` (PAYMENT_REDIRECT_ORIGINS += momo, PUBLIC_API_URL nếu thiếu)

**Contracts**
- [ ] `packages/contracts/src/contracts/payment.ts` (gatewayKeySchema += momo; momoGatewayConfigInputSchema) → rebuild dist

**Frontend — dashboard**
- [ ] `app/routes/tenant/settings.tsx` (selector 3 lựa chọn)
- [ ] `app/features/tenant/components/settings/momo-gateway-card.tsx` (mới)
- [ ] `app/features/tenant/server/settings-actions.server.ts` (nhánh momo + off)
- [ ] `app/features/tenant/*/settings-fields.ts` (momo fields, schema)
- [ ] `app/features/payments/components/refunds-panel.tsx` (nhãn phương thức, trạng thái auto, tổng)

**Frontend — storefront**
- [ ] `payment-status` route (xử lý MoMo redirect + poll)
- [ ] Booking detail customer (dòng "đã hoàn về ví MoMo")

**Verify**: `pnpm turbo lint typecheck build` + chạy app (checkout MoMo sandbox → IPN → cancel → auto-refund → panel).

---

## 12. Câu hỏi mở (cần xác nhận lúc code)
1. Reconciliation worker có gọi `markSucceeded` không (để persist transId đường phục hồi)? — verify khi code §4.
2. Có sẵn biến `PUBLIC_API_URL` (base tuyệt đối) để dựng `ipnUrl` gửi MoMo không? Nếu chưa → thêm env.
3. `orderExpireTime` MoMo tính bằng phút — xác nhận đơn vị khi test sandbox.
