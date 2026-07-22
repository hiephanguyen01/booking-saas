# ZaloPay + Ví song song (MoMo ∥ ZaloPay) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tích hợp cổng ZaloPay và cho phép tenant bật **đồng thời** 2 ví (MoMo + ZaloPay) bên cạnh cổng cơ bản SePay (giữ nguyên luồng SePay), với toggle bật/tắt từng ví trong Settings.

**Architecture:** Chuyển model gateway-config từ *single-active* sang *grouped-active*: nhóm **BASE** (`sepay`/`payos`/`mock` — tối đa 1 active, như cũ) + nhóm **WALLET** (`momo`, `zalopay` — bật/tắt độc lập, song song). Checkout route cổng theo `paymentMethod` khách chọn (ví ↔ cổng 1:1, method base → cổng base). Refund/webhook đã route theo `payment.gateway` nên không đổi kiến trúc. `ZalopayGatewayAdapter` theo khuôn MoMo nhưng xử lý 2 đặc thù ZaloPay: id bắt buộc prefix `yymmdd` (giờ VN) và **refund async** (query-before-refund + poll).

**Tech Stack:** NestJS 11 hexagonal (port/adapter), Prisma + hand-written migration, zod contracts (`@booking/contracts`), React Router 8 (dashboard + storefront), HMAC-SHA256 (`node:crypto`).

## Global Constraints

- **KHÔNG TEST** (ADR 0005): không tạo `*.spec.*`/`*.test.*`. Verify mỗi task = `pnpm --filter=@booking/api typecheck && pnpm --filter=@booking/api lint` (+ dashboard/storefront khi đụng FE) và build ở task cuối.
- Backend flow `controller → use-case → repository-port → repository`; **không service class**; 1 use-case = 1 file (ADR 0006).
- Tiền = `bigint` VND; module giao tiếp qua outbox; RLS qua `TenantDbService.forTenant`.
- Contracts đổi xong phải `pnpm --filter=@booking/contracts build` (frontends đọc dist).
- FE cần Node ≥ 22.22.0 (`nvm use 22.22.0`).
- Migration **viết tay** (không `prisma migrate dev`), rồi `pnpm --filter=@booking/api prisma:generate`.
- Không đặt secret provider vào env — credentials per-tenant, AES-GCM trong DB.
- **SePay giữ nguyên luồng cũ** (form config, IPN, manual refund flow không đổi).

## Quyết định thiết kế đã chốt (từ brainstorm 2026-07-22)

| # | Quyết định |
|---|-----------|
| 1 | 2 ví **song song**; SePay là cổng BASE riêng, có thể active đồng thời với các ví. |
| 2 | Ví ↔ method 1:1: `momo_wallet`→momo, `zalopay_wallet`→zalopay. Method base (`bank_transfer`/`napas_qr`/`international_card`) → cổng BASE. Không method nào bị 2 cổng tranh nhau. |
| 3 | Ví bật lên là dùng settings mặc định (`automatic_preferred`, enabledMethods = method của ví). Card "Phương thức thanh toán" chỉ áp cho cổng BASE. Per-wallet settings UI = follow-up, KHÔNG làm ở plan này. |
| 4 | ZaloPay refund **async**: adapter tự xử lý query-before-refund (id deterministic theo ngày VN, check cả hôm nay + hôm qua) + poll ngắn; lỗi dứt khoát → `supported:false` (manual fallback); đang xử lý → throw (redeliver). Không đổi port/schema. |
| 5 | `security_deposit` KHÔNG auto-refund (mọi cổng — giữ quyết định trước). ZaloPay auto-refund tiền đơn (kể cả một phần) như MoMo. |

## Facts đã verify từ docs ZaloPay (docs.zalopay.vn)

- Base URL: sandbox `https://sb-openapi.zalopay.vn`, production `https://openapi.zalopay.vn`. Endpoints: `POST /v2/create`, `/v2/query`, `/v2/refund`, `/v2/query_refund`.
- Creds: `app_id` (số), `key1` (ký request), `key2` (verify callback). HMAC-SHA256, ký chuỗi nối `|`.
- `app_trans_id` ≤40 ký tự, **bắt buộc prefix `yymmdd` theo giờ VN (GMT+7) hiện tại** → không dùng orderCode `BKF-…` trực tiếp; adapter mint id riêng, trả qua `CreatePaymentResult.gatewayOrderRef`.
- Chuỗi ký create: `app_id|app_trans_id|app_user|amount|app_time|embed_data|item` (key1). Redirect sau thanh toán đặt trong `embed_data.redirecturl`; khách pay qua `order_url`. `expire_duration_seconds` min 300.
- Callback: POST `{data: string, mac}`; verify `mac = HMAC(key2, data)`; `data` JSON chứa `app_trans_id`, `zp_trans_id`, `amount`; merchant trả `{return_code: 1, return_message}` để dừng retry. Callback chỉ bắn khi thanh toán THÀNH CÔNG.
- Query order: chuỗi ký `app_id|app_trans_id|key1`. `return_code`: 1=success, 2=fail, 3=processing.
- Refund: `m_refund_id` = `yymmdd_appid_xxx` (≤45, yymmdd = ngày VN hiện tại); chuỗi ký `app_id|zp_trans_id|amount|description|timestamp` (key1); **async** — `return_code 3` = đang xử lý, poll `/v2/query_refund` (ký `app_id|m_refund_id|timestamp`).
- ⚠️ Verify khi chạy sandbox: origin thật của `order_url` (để thêm `PAYMENT_REDIRECT_ORIGINS`) và giới hạn số ngày được refund.

## File map

```
packages/contracts/src/contracts/payment.ts          M  zalopay key/method/schemas + wallet helpers
apps/api/prisma/migrations/<ts>_add_zalopay/…        C  ALTER TYPE enum
apps/api/prisma/schema.prisma                        M  enum PaymentGateway += zalopay
apps/api/…/domain/ports/payment-gateway.port.ts      M  GatewayKey += 'zalopay'
apps/api/…/domain/method-routing.ts                  C  pickConfigForMethod (pure)
apps/api/…/infrastructure/gateways/zalopay-gateway.adapter.ts  C  adapter
apps/api/…/infrastructure/gateway-registry.ts        M  case zalopay ×2
apps/api/…/infrastructure/http/webhook.controller.ts M  response body theo gateway
apps/api/…/domain/ports/gateway-config-repository.port.ts      M  findActiveAll/findActiveBase/deactivate/updateSettings(gateway)
apps/api/…/infrastructure/repositories/prisma-gateway-config.repository.ts  M  grouped-active
apps/api/…/application/use-cases/{checkout,get-public-payment-options,get-gateway-config,deactivate-gateway,update-gateway-payment-settings,upsert-gateway-config,execute-refund,execute-automatic-refund}.use-case.ts  M
apps/api/…/application/payments.mapper.ts            M  appId + array response
apps/api/…/infrastructure/http/tenant-gateway.controller.ts    M  GET array, DELETE ?gateway
apps/dashboard/…/settings/{payment-gateway-card,zalopay-gateway-card}.tsx  M/C  wallet toggles
apps/dashboard/…/settings/settings-fields.ts         M  zalopay fields
apps/dashboard/…/server/settings-actions.server.ts   M  zalopay + disable ?gateway + settings.gateway
apps/dashboard/app/routes/tenant/settings.tsx        M  configs array
apps/dashboard/app/constants/payments.ts             M  labels
apps/storefront/…/checkout/components/checkout-form.tsx        M  zalopay_wallet
packages/i18n/src/locales/{vi,en}/checkout.ts        M  zaloWallet label
.env.example                                         M  redirect origins
```

---

### Task 1: Contracts — zalopay + wallet helpers

**Files:**
- Modify: `packages/contracts/src/contracts/payment.ts`

**Interfaces (Produces):**
- `gatewayKeySchema` gồm `'zalopay'`; `customerPaymentMethodSchema` gồm `'zalopay_wallet'`.
- `WALLET_GATEWAYS: readonly GatewayKey[]`, `isWalletGateway(g): boolean`, `walletGatewayForMethod(m): GatewayKey | null`.
- `zalopayGatewayConfigInputSchema` (`{gateway:'zalopay', environment, credentials:{appId,key1,key2}}`), `zalopayGatewaySettingsFormSchema` (`{environment,appId,key1,key2}`).
- `gatewayConfigResponseSchema` += `appId: z.string().nullable().default(null)`; `gatewayConfigsResponseSchema = z.array(gatewayConfigResponseSchema)`.
- `updateGatewayPaymentSettingsInputSchema` = settings **+ `gateway: gatewayKeySchema`**.
- `defaultGatewayPaymentSettings('zalopay')` → `automatic_preferred` + `['zalopay_wallet']`.

- [ ] **Step 1: Sửa enum + thêm helpers** — trong `payment.ts`:

```ts
export const gatewayKeySchema = z.enum(['sepay', 'payos', 'momo', 'zalopay', 'mock']);
// customerPaymentMethodSchema: thêm 'zalopay_wallet' vào enum
// GATEWAY_SUPPORTED_METHODS: += zalopay: ['zalopay_wallet']; mock: += 'zalopay_wallet'
// gatewayPaymentSettingsSchema: enabledMethods max(5)

/** Wallet gateways can be enabled in parallel; base gateways stay single-active. */
export const WALLET_GATEWAYS = ['momo', 'zalopay'] as const;
export function isWalletGateway(gateway: GatewayKey): boolean {
  return (WALLET_GATEWAYS as readonly string[]).includes(gateway);
}
/** 1:1 wallet-method → wallet-gateway routing; null = base-gateway method. */
export function walletGatewayForMethod(method: CustomerPaymentMethod): GatewayKey | null {
  return method === 'momo_wallet' ? 'momo' : method === 'zalopay_wallet' ? 'zalopay' : null;
}
```

- [ ] **Step 2: `defaultGatewayPaymentSettings`** — sửa điều kiện auto:

```ts
refundStrategy:
  gateway === 'momo' || gateway === 'zalopay' || gateway === 'sepay'
    ? 'automatic_preferred'
    : 'manual',
```

- [ ] **Step 3: Schemas zalopay** (đặt cạnh momo schemas):

```ts
export const zalopayGatewayConfigInputSchema = z.object({
  gateway: z.literal('zalopay'),
  environment: gatewayEnvironmentSchema,
  credentials: z.object({
    appId: z.string().trim().regex(/^\d+$/, 'App ID là số').max(20),
    key1: z.string().trim().min(16, 'Key1 phải có ít nhất 16 ký tự').max(500),
    key2: z.string().trim().min(16, 'Key2 phải có ít nhất 16 ký tự').max(500),
  }),
});
export type ZalopayGatewayConfigInput = z.infer<typeof zalopayGatewayConfigInputSchema>;

export const zalopayGatewaySettingsFormSchema = z.object({
  environment: gatewayEnvironmentSchema,
  appId: z.string().trim().regex(/^\d+$/, 'App ID là số').max(20),
  key1: z.string().trim().min(16, 'Key1 phải có ít nhất 16 ký tự').max(500),
  key2: z.string().trim().min(16, 'Key2 phải có ít nhất 16 ký tự').max(500),
});
export type ZalopayGatewaySettingsForm = z.infer<typeof zalopayGatewaySettingsFormSchema>;
```

- [ ] **Step 4: Response + settings-input**:

```ts
// gatewayConfigResponseSchema: thêm
  appId: z.string().nullable().default(null),
// mới:
export const gatewayConfigsResponseSchema = z.array(gatewayConfigResponseSchema);
export type GatewayConfigsResponse = z.infer<typeof gatewayConfigsResponseSchema>;
// updateGatewayPaymentSettingsInputSchema đổi thành:
export const updateGatewayPaymentSettingsInputSchema = gatewayPaymentSettingsSchema.extend({
  gateway: gatewayKeySchema,
});
```

- [ ] **Step 5: Build + verify** — `pnpm --filter=@booking/contracts build` → exit 0. (API/dashboard sẽ đỏ tạm vì `PaymentGateway` prisma chưa có zalopay — chấp nhận, xanh lại ở Task 2–5.)
- [ ] **Step 6: Commit** — `git commit -m "feat(contracts): zalopay gateway + wallet-parallel helpers"`

---

### Task 2: DB enum + Prisma

**Files:**
- Create: `apps/api/prisma/migrations/20260722120000_add_zalopay_gateway/migration.sql`
- Modify: `apps/api/prisma/schema.prisma` (enum `PaymentGateway`)

- [ ] **Step 1: Migration** (viết tay):

```sql
-- Add zalopay to the payment_gateway enum (wallet gateway, parallel-enabled).
ALTER TYPE payment_gateway ADD VALUE IF NOT EXISTS 'zalopay';
```

- [ ] **Step 2: schema.prisma** — enum `PaymentGateway` thêm `zalopay` (sau `momo`, trước `vnpay`).
- [ ] **Step 3: Apply + generate** — `pnpm --filter=@booking/api prisma:deploy && pnpm --filter=@booking/api prisma:generate` → cả hai exit 0. Chạy `pnpm --filter=@booking/api check:rls` → PASS (không bảng mới).
- [ ] **Step 4: Commit** — `git commit -m "feat(db): add zalopay to payment_gateway enum"`

---

### Task 3: ZalopayGatewayAdapter + port + registry + webhook response

**Files:**
- Modify: `apps/api/src/modules/payments/domain/ports/payment-gateway.port.ts` (dòng `GatewayKey`)
- Create: `apps/api/src/modules/payments/infrastructure/gateways/zalopay-gateway.adapter.ts`
- Modify: `apps/api/src/modules/payments/infrastructure/gateway-registry.ts`
- Modify: `apps/api/src/modules/payments/infrastructure/http/webhook.controller.ts`

**Interfaces:**
- Consumes: `PaymentGatewayPort` hiện có (providerPaymentMethod/createPayment/peekReference/verifyWebhook/refund/queryPaymentStatus), `CreatePaymentResult.gatewayOrderRef` (checkout persist làm `gateway_order_ref`).
- Produces: `ZalopayGatewayAdapter` (`key='zalopay'`), constructor `{appId,key1,key2,environment}`.

- [ ] **Step 1: Port** — `export type GatewayKey = 'sepay' | 'payos' | 'momo' | 'zalopay' | 'mock';`

- [ ] **Step 2: Adapter** — tạo file với nội dung đầy đủ:

```ts
import { createHash, createHmac } from 'node:crypto';
import type { CustomerPaymentMethod } from '@booking/contracts';
import type {
  CreatePaymentInput,
  CreatePaymentResult,
  GatewayKey,
  PaymentGatewayPort,
  PaymentStatusResult,
  RefundInput,
  RefundResult,
  WebhookVerification,
} from '../../domain/ports/payment-gateway.port';

export interface ZalopayCredentials {
  appId: string;
  key1: string;
  key2: string;
  environment: 'sandbox' | 'production';
}

/** yymmdd theo giờ VN (GMT+7) — ZaloPay bắt buộc app_trans_id/m_refund_id prefix ngày hiện tại. */
function vnDatePrefix(daysAgo = 0): string {
  const vn = new Date(Date.now() + 7 * 3_600_000 - daysAgo * 86_400_000);
  return vn.toISOString().slice(2, 10).replaceAll('-', '');
}

function shortHash(value: string, length: number): string {
  return createHash('sha256').update(value).digest('hex').slice(0, length);
}

const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * ZaloPay adapter (§11.1) — v2 create/callback/refund/query, bound to tenant creds.
 * Khác MoMo: (1) app_trans_id phải prefix yymmdd giờ VN → adapter mint id riêng và trả
 * qua gatewayOrderRef; (2) refund là ASYNC (return_code 3 = processing) → query-before-
 * refund với id deterministic theo ngày (check cả hôm qua để an toàn qua nửa đêm) + poll
 * ngắn; đang-xử-lý thì throw để redeliver, bị từ chối dứt khoát thì supported:false.
 * NOTE: cần verify end-to-end với sandbox creds thật (CI chỉ cover mock gateway).
 */
export class ZalopayGatewayAdapter implements PaymentGatewayPort {
  readonly key: GatewayKey = 'zalopay';
  private readonly base: string;

  constructor(private readonly creds: ZalopayCredentials) {
    this.base =
      creds.environment === 'production'
        ? 'https://openapi.zalopay.vn'
        : 'https://sb-openapi.zalopay.vn';
  }

  /** ZaloPay chỉ thanh toán qua ví ZaloPay, bất kể lựa chọn storefront. */
  providerPaymentMethod(_method: CustomerPaymentMethod): string {
    return 'ZALOPAY_WALLET';
  }

  private mac(key: string, raw: string): string {
    return createHmac('sha256', key).update(raw).digest('hex');
  }

  private callbackUrl(): string {
    const origin = (process.env.PUBLIC_API_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
    return `${origin}/webhooks/zalopay`;
  }

  async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    const { appId, key1 } = this.creds;
    // orderCode BKF-… không thoả format yymmdd_ ≤40 ký tự → mint id riêng, deterministic
    // theo orderCode; trả về gatewayOrderRef để checkout persist (IPN sẽ echo lại id này).
    const appTransId = `${vnDatePrefix()}_${shortHash(input.orderCode, 24)}`;
    const appTime = Date.now();
    const amount = Number(input.amountVnd);
    const embedData = JSON.stringify({ redirecturl: input.returnUrl });
    const item = '[]';
    // Chuỗi ký cố định của ZaloPay — không đổi thứ tự.
    const raw = `${appId}|${appTransId}|${input.orderCode}|${amount}|${appTime}|${embedData}|${item}`;
    const res = await fetch(`${this.base}/v2/create`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        app_id: Number(appId),
        app_user: input.orderCode,
        app_trans_id: appTransId,
        app_time: appTime,
        amount,
        item,
        embed_data: embedData,
        description: input.description,
        callback_url: this.callbackUrl(),
        expire_duration_seconds: Math.max(300, input.expiresInSec),
        mac: this.mac(key1, raw),
      }),
    });
    const json = (await res.json()) as {
      return_code?: number;
      return_message?: string;
      order_url?: string;
    };
    if (json.return_code !== 1 || !json.order_url) {
      throw new Error(`ZaloPay create failed (${json.return_code}): ${json.return_message ?? 'unknown'}`);
    }
    return {
      destination: { type: 'redirect', paymentUrl: json.order_url },
      gatewayOrderRef: appTransId,
      paymentMethod: 'ZALOPAY_WALLET',
    };
  }

  peekReference(rawBody: Buffer): string | null {
    try {
      const body = JSON.parse(rawBody.toString('utf8')) as { data?: string };
      if (!body.data) return null;
      const data = JSON.parse(body.data) as { app_trans_id?: string };
      return data.app_trans_id ?? null;
    } catch {
      return null;
    }
  }

  verifyWebhook(rawBody: Buffer): WebhookVerification {
    const body = JSON.parse(rawBody.toString('utf8')) as { data?: string; mac?: string };
    const dataStr = body.data ?? '';
    const valid = dataStr.length > 0 && this.mac(this.creds.key2, dataStr) === body.mac;
    const data = valid
      ? (JSON.parse(dataStr) as { app_trans_id?: string; zp_trans_id?: number; amount?: number })
      : {};
    return {
      valid,
      event: 'succeeded', // ZaloPay chỉ callback khi thanh toán thành công
      gatewayTxnId: data.zp_trans_id !== undefined ? String(data.zp_trans_id) : '',
      gatewayOrderRef: data.app_trans_id,
      paymentMethod: 'ZALOPAY_WALLET',
      amountVnd: BigInt(data.amount ?? 0),
    };
  }

  /** m_refund_id deterministic theo (orderRef, reason) trong 1 ngày VN → retry cùng ngày idempotent. */
  private refundId(orderRef: string, reason: string, daysAgo = 0): string {
    return `${vnDatePrefix(daysAgo)}_${this.creds.appId}_${shortHash(`${orderRef}:${reason}`, 20)}`;
  }

  /** return_code của /v2/query_refund: 1=success, 2=failed, 3=processing; null=lỗi/không thấy. */
  private async queryRefund(mRefundId: string): Promise<number | null> {
    const { appId, key1 } = this.creds;
    const timestamp = Date.now();
    const raw = `${appId}|${mRefundId}|${timestamp}`;
    const res = await fetch(`${this.base}/v2/query_refund`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        app_id: Number(appId),
        m_refund_id: mRefundId,
        timestamp,
        mac: this.mac(key1, raw),
      }),
    });
    const json = (await res.json()) as { return_code?: number };
    return json.return_code ?? null;
  }

  async refund(input: RefundInput): Promise<RefundResult> {
    if (!/^\d+$/.test(input.gatewayTxnId)) {
      return { supported: false }; // thiếu zp_trans_id → manual fallback (không gửi request hỏng)
    }
    // Chống double-refund khi redeliver: id theo ngày VN — check attempt hôm nay VÀ hôm
    // qua trước khi bắn lệnh mới (cover retry vắt qua nửa đêm).
    for (const daysAgo of [0, 1]) {
      const id = this.refundId(input.gatewayOrderRef, input.reason, daysAgo);
      const code = await this.queryRefund(id);
      if (code === 1) return { supported: true, refundId: id };
      if (code === 3) throw new Error('ZaloPay refund still processing'); // redeliver sau
    }
    const { appId, key1 } = this.creds;
    const mRefundId = this.refundId(input.gatewayOrderRef, input.reason);
    const timestamp = Date.now();
    const amount = Number(input.amountVnd);
    const description = input.reason;
    const raw = `${appId}|${input.gatewayTxnId}|${amount}|${description}|${timestamp}`;
    const res = await fetch(`${this.base}/v2/refund`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        app_id: Number(appId),
        m_refund_id: mRefundId,
        zp_trans_id: input.gatewayTxnId,
        amount,
        timestamp,
        description,
        mac: this.mac(key1, raw),
      }),
      signal: AbortSignal.timeout(30_000),
    });
    const json = (await res.json()) as { return_code?: number; refund_id?: number };
    if (json.return_code === 1) {
      return { supported: true, refundId: String(json.refund_id ?? mRefundId) };
    }
    if (json.return_code === 3) {
      // Async — poll ngắn; còn processing thì throw để redeliver (cùng ngày → cùng id).
      for (let i = 0; i < 3; i++) {
        await wait(2_000);
        const code = await this.queryRefund(mRefundId);
        if (code === 1) return { supported: true, refundId: mRefundId };
        if (code === 2) return { supported: false }; // ZaloPay từ chối → manual + SLA
      }
      throw new Error('ZaloPay refund still processing');
    }
    return { supported: false }; // từ chối dứt khoát → manual + SLA
  }

  async queryPaymentStatus(reference: string): Promise<PaymentStatusResult> {
    // reference = app_trans_id (reconciliation truyền gatewayOrderRef).
    const { appId, key1 } = this.creds;
    const raw = `${appId}|${reference}|${key1}`;
    const res = await fetch(`${this.base}/v2/query`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        app_id: Number(appId),
        app_trans_id: reference,
        mac: this.mac(key1, raw),
      }),
    });
    const json = (await res.json()) as {
      return_code?: number;
      amount?: number;
      zp_trans_id?: number;
    };
    const status: PaymentStatusResult['status'] =
      json.return_code === 1 ? 'succeeded' : json.return_code === 3 ? 'pending' : 'expired';
    return {
      status,
      amountVnd: BigInt(json.amount ?? 0),
      gatewayTxnId: json.zp_trans_id !== undefined ? String(json.zp_trans_id) : undefined,
    };
  }
}
```

- [ ] **Step 3: Registry** — `gateway-registry.ts` thêm import + 2 case (theo đúng khuôn momo):

```ts
// statelessByKey:
if (key === 'zalopay') {
  return new ZalopayGatewayAdapter({ appId: '', key1: '', key2: '', environment: 'sandbox' });
}
// resolveForTenant (trước nhánh payos cuối):
if (cfg.gateway === 'zalopay') {
  return new ZalopayGatewayAdapter({
    appId: cfg.credentials.appId ?? '',
    key1: cfg.credentials.key1 ?? '',
    key2: cfg.credentials.key2 ?? '',
    environment: cfg.environment,
  });
}
```

- [ ] **Step 4: Webhook response theo gateway** — `webhook.controller.ts`: ZaloPay yêu cầu body `{return_code:1}` để dừng retry. Đổi handler:

```ts
async receive(/* giữ params hiện có */): Promise<Record<string, unknown>> {
  await this.handler.execute(gateway, req.rawBody ?? Buffer.from(''), req.headers as never);
  return gateway === 'zalopay' ? { return_code: 1, return_message: 'success' } : { success: true };
}
```
(Giữ `@HttpCode(200)`; lỗi verify vẫn throw → Nest trả error shape → ZaloPay coi là fail và retry — đúng ý.)

- [ ] **Step 5: Verify** — `pnpm --filter=@booking/api typecheck && pnpm --filter=@booking/api lint` → exit 0.
- [ ] **Step 6: Commit** — `git commit -m "feat(payments): ZalopayGatewayAdapter (async refund, VN-date ids) + registry + webhook ack"`

---

### Task 4: Grouped-active config (repo + port + use-cases + controller)

**Files:**
- Modify: `apps/api/src/modules/payments/domain/ports/gateway-config-repository.port.ts`
- Modify: `apps/api/src/modules/payments/infrastructure/repositories/prisma-gateway-config.repository.ts`
- Modify: use-cases `get-gateway-config`, `deactivate-gateway`, `update-gateway-payment-settings`, `upsert-gateway-config`
- Modify: `apps/api/src/modules/payments/application/payments.mapper.ts`
- Modify: `apps/api/src/modules/payments/infrastructure/http/tenant-gateway.controller.ts`

**Interfaces (Produces — Task 5 phụ thuộc):**
- `IGatewayConfigRepository`: `findActiveAll(tx, tenantId): Promise<GatewayConfigRecord[]>`; `findActiveBase(tx, tenantId): Promise<GatewayConfigRecord | null>` (đổi tên từ `findActive` — cập nhật MỌI call site); `deactivate(tx, tenantId, gateway?: GatewayKey): Promise<void>` (thay `deactivateAll`); `updateSettings(tx, tenantId, gateway, settings)`.
- `GetGatewayConfigUseCase.execute(): Promise<GatewayConfigRecord[]>`.
- `toGatewayConfigResponse` thêm `appId` (zalopay).

- [ ] **Step 1: Port** — sửa interface:

```ts
findActiveAll(tx: PrismaTx, tenantId: string): Promise<GatewayConfigRecord[]>;
/** Cổng BASE (sepay/payos/mock) đang active — tối đa 1; ví KHÔNG tính. */
findActiveBase(tx: PrismaTx, tenantId: string): Promise<GatewayConfigRecord | null>;
/** Tắt 1 cổng (gateway) hoặc tắt hết (không truyền). */
deactivate(tx: PrismaTx, tenantId: string, gateway?: GatewayKey): Promise<void>;
updateSettings(
  tx: PrismaTx,
  tenantId: string,
  gateway: GatewayKey,
  settings: GatewayPaymentSettings,
): Promise<GatewayConfigRecord | null>;
```

- [ ] **Step 2: Repo impl** — trong `prisma-gateway-config.repository.ts` (import `isWalletGateway`, `WALLET_GATEWAYS` từ contracts):

```ts
async findActiveAll(tx: PrismaTx, tenantId: string): Promise<GatewayConfigRecord[]> {
  const rows = await tx.tenantGatewayConfig.findMany({
    where: { tenantId, isActive: true },
    orderBy: { createdAt: 'asc' },
  });
  return rows.map((c) => this.toRecord(c));
}

async findActiveBase(tx: PrismaTx, tenantId: string): Promise<GatewayConfigRecord | null> {
  const c = await tx.tenantGatewayConfig.findFirst({
    where: { tenantId, isActive: true, gateway: { notIn: [...WALLET_GATEWAYS] } },
  });
  return c ? this.toRecord(c) : null;
}

async deactivate(tx: PrismaTx, tenantId: string, gateway?: GatewayKey): Promise<void> {
  await tx.tenantGatewayConfig.updateMany({
    where: { tenantId, isActive: true, ...(gateway ? { gateway } : {}) },
    data: { isActive: false },
  });
}
```
Trong `upsert`: thay khối `updateMany` deactivate-all bằng **chỉ deactivate BASE khác khi lưu cổng BASE** (ví bật song song, không tắt gì):

```ts
if (!isWalletGateway(data.gateway)) {
  await tx.tenantGatewayConfig.updateMany({
    where: { tenantId, isActive: true, gateway: { notIn: [...WALLET_GATEWAYS] } },
    data: { isActive: false },
  });
}
```
`updateSettings` đổi chữ ký: tìm `findFirst({ where: { tenantId, gateway, isActive: true } })` rồi update theo id. `findByGateway` hardening: `orderBy: [{ isActive: 'desc' }, { updatedAt: 'desc' }]` (ưu tiên row đang active/đúng env).

- [ ] **Step 3: Use-cases**:
  - `get-gateway-config.use-case.ts`: `execute(): Promise<GatewayConfigRecord[]>` → `findActiveAll`.
  - `deactivate-gateway.use-case.ts`: `execute(gateway?: GatewayKey)` → `configs.deactivate(tx, tenantId, gateway)`.
  - `update-gateway-payment-settings.use-case.ts`: input giờ có `gateway`; validate: config active của `input.gateway` phải tồn tại (`404 GATEWAY_CONFIG_NOT_FOUND`), `enabledMethods ⊆ GATEWAY_SUPPORTED_METHODS[input.gateway]` (`400 UNSUPPORTED_PAYMENT_METHOD`); gọi `updateSettings(tx, tenantId, input.gateway, {enabledMethods, refundStrategy, manualRefundSlaHours})`.
  - `upsert-gateway-config.use-case.ts`: thêm nhánh validate zalopay:

```ts
: input.gateway === 'zalopay'
  ? zalopayGatewayConfigInputSchema.safeParse(input)
```

- [ ] **Step 4: Mapper + controller**:

```ts
// payments.mapper.ts — toGatewayConfigResponse thêm:
appId: config.gateway === 'zalopay' ? (config.credentials.appId ?? null) : null,
```
`tenant-gateway.controller.ts`:
  - `GET` → `Promise<GatewayConfigResponse[]>`: `(await this.getConfig.execute()).map(toGatewayConfigResponse)`.
  - `DELETE` → nhận `@Query('gateway', new ZodValidationPipe(gatewayKeySchema.optional())) gateway?: GatewayKey` → `this.deactivate.execute(gateway)`.

- [ ] **Step 5: Sửa các call site `findActive` còn lại để compile** — `grep -rn "findActive\b" apps/api/src/modules/payments`: `get-public-payment-options` và `checkout`/`execute-refund`/`execute-automatic-refund` sẽ được rework ở Task 5 — tạm đổi tên gọi sang `findActiveBase` cho compile (Task 5 thay logic thật).
- [ ] **Step 6: Verify** — `pnpm --filter=@booking/api typecheck && pnpm --filter=@booking/api lint` → exit 0.
- [ ] **Step 7: Commit** — `git commit -m "feat(payments): grouped-active gateway configs (base single + parallel wallets)"`

---

### Task 5: Routing theo method — checkout, public options, refund settings

**Files:**
- Create: `apps/api/src/modules/payments/domain/method-routing.ts`
- Modify: `checkout.use-case.ts`, `get-public-payment-options.use-case.ts`, `execute-refund.use-case.ts`, `execute-automatic-refund.use-case.ts`

**Interfaces:**
- Consumes: `findActiveAll`/`findByGateway` (Task 4), `walletGatewayForMethod`/`isWalletGateway`/`GATEWAY_SUPPORTED_METHODS` (Task 1).
- Produces: `pickConfigForMethod(configs, method): GatewayConfigRecord | null` (pure domain fn).

- [ ] **Step 1: Pure routing fn** — `domain/method-routing.ts`:

```ts
import {
  GATEWAY_SUPPORTED_METHODS,
  isWalletGateway,
  walletGatewayForMethod,
  type CustomerPaymentMethod,
} from '@booking/contracts';
import type { GatewayConfigRecord } from './ports/gateway-config-repository.port';

/**
 * Chọn config phục vụ 1 method: method ví → đúng cổng ví đó (1:1); method base →
 * cổng BASE đang active có bật method. Trả null khi không cổng nào phục vụ.
 */
export function pickConfigForMethod(
  configs: GatewayConfigRecord[],
  method: CustomerPaymentMethod,
): GatewayConfigRecord | null {
  const wallet = walletGatewayForMethod(method);
  const serves = (c: GatewayConfigRecord): boolean =>
    c.settings.enabledMethods.includes(method) &&
    GATEWAY_SUPPORTED_METHODS[c.gateway].includes(method);
  if (wallet) return configs.find((c) => c.gateway === wallet && serves(c)) ?? null;
  return configs.find((c) => !isWalletGateway(c.gateway) && serves(c)) ?? null;
}
```

- [ ] **Step 2: Checkout rework** — thay khối `findActive`+`enabledMethods` check + `resolveForTenant()` không-arg bằng:

```ts
const configs = await this.configs.findActiveAll(tx, tenant.id);
const routed = pickConfigForMethod(configs, paymentMethod);
if (!routed && configs.length > 0) {
  throw new BadRequestException({
    statusCode: 400,
    code: 'PAYMENT_METHOD_UNAVAILABLE',
    message: 'The selected payment method is not enabled for this storefront',
  });
}
// configs rỗng → resolveForTenant trả mock (dev); guard NO_ACTIVE_GATEWAY prod giữ nguyên phía dưới
const gateway = await this.registry.resolveForTenant(tx, tenant.id, routed?.gateway);
```
Giữ nguyên: guard `NO_ACTIVE_GATEWAY` (mock+prod), guard MoMo 50tr, `providerPaymentMethod`, idempotent `findPendingCheckout(tx, bookingId, providerPaymentMethod)` (per-method — 2 ví có thể có 2 pending link riêng cho 1 booking; webhook chốt 1 cái, cái kia expire qua reconciliation — chấp nhận, ghi chú comment).

- [ ] **Step 3: Public options = union** — `get-public-payment-options.use-case.ts`:

```ts
const configs = await this.tenantDb.forTenant(tenant.id, (tx) =>
  this.configs.findActiveAll(tx, tenant.id),
);
if (configs.length === 0) { /* giữ nguyên mock-dev fallback + 503 hiện có */ }
const methods = [
  ...new Set(
    configs.flatMap((c) =>
      c.settings.enabledMethods.filter((m) => GATEWAY_SUPPORTED_METHODS[c.gateway].includes(m)),
    ),
  ),
];
if (methods.length === 0) {
  throw new ServiceUnavailableException({
    statusCode: 503,
    code: 'PAYMENT_NOT_CONFIGURED',
    message: 'This storefront is not accepting online payments',
  });
}
return { methods };
```

- [ ] **Step 4: Refund đọc settings THEO CỔNG CỦA PAYMENT** (đa cổng → không dùng config base):
  - `execute-refund.use-case.ts`: `const config = await this.configs.findByGateway(tx, tenantId, payment.gateway);` (thay `findActiveBase`). Điều kiện auto thêm zalopay:

```ts
const isWalletAuto = payment.gateway === 'momo' || payment.gateway === 'zalopay';
const automatic =
  settings.refundStrategy === 'automatic_preferred' &&
  reason !== 'security_deposit' &&
  (isSepayCardFull || isWalletAuto);
```
  - `execute-automatic-refund.use-case.ts`: `const config = await this.configs.findByGateway(tx, tenantId, payment.gateway);` (thay `findActive`).

- [ ] **Step 5: Verify** — `pnpm --filter=@booking/api typecheck && pnpm --filter=@booking/api lint` → exit 0. `grep -rn "findActiveBase\|findActiveAll" apps/api/src/modules/payments` — xác nhận không còn call site nào dùng semantics cũ sai chỗ.
- [ ] **Step 6: Commit** — `git commit -m "feat(payments): route checkout/options/refund per payment method across parallel gateways"`

---

### Task 6: Dashboard — wallet toggles + ZaloPay card

**Files:**
- Modify: `apps/dashboard/app/features/tenant/components/settings/payment-gateway-card.tsx`
- Create: `apps/dashboard/app/features/tenant/components/settings/zalopay-gateway-card.tsx`
- Modify: `settings-fields.ts`, `settings-actions.server.ts`, `app/routes/tenant/settings.tsx`, `app/constants/payments.ts`

**Interfaces:**
- Consumes: `GET /tenant/gateway-config` → `GatewayConfigResponse[]`; `DELETE /tenant/gateway-config?gateway=<key>`; PUT settings body có `gateway`.
- Produces: `PaymentGatewayCard({ configs: GatewayConfigResponse[], … })`; `ZalopayGatewayBody` (5 props như `MomoGatewayBody`).

- [ ] **Step 1: `zalopayGatewayFields`** trong `settings-fields.ts` (khuôn momo):

```ts
export const zalopayGatewayFields: FieldConfig<ZalopayGatewaySettingsForm>[] = [
  { name: 'environment', type: 'radio', label: 'Môi trường', variant: 'segmented',
    options: [{ label: 'Sandbox', value: 'sandbox' }, { label: 'Production', value: 'production' }],
    colSpan: 2 },
  { name: 'appId', type: 'text', label: 'App ID', placeholder: '2553', required: true },
  { name: 'key1', type: 'password', label: 'Key1',
    description: 'Ký create/refund/query gửi ZaloPay.', autoComplete: 'new-password', required: true },
  { name: 'key2', type: 'password', label: 'Key2',
    description: 'Xác thực callback (IPN) từ ZaloPay.', autoComplete: 'new-password', required: true,
    colSpan: 2 },
];
```

- [ ] **Step 2: `ZalopayGatewayBody`** — copy khuôn `momo-gateway-card.tsx`: alert saved/active (`Đang hoạt động ở {env} · App ID {appId}. Hoàn tiền huỷ đơn tự động về ví ZaloPay của khách.`), `GenericForm` (`schema: zalopayGatewaySettingsFormSchema`, `transform` → `{gateway:'zalopay', environment, credentials:{appId,key1,key2}}`, `submitLabel: 'Lưu cấu hình ZaloPay'`), hướng dẫn: callback URL `/webhooks/zalopay`, key1/key2 lấy ở merchant.zalopay.vn, sandbox/production 2 bộ key riêng.

- [ ] **Step 3: `PaymentGatewayCard` rework** — props đổi `config` → `configs: GatewayConfigResponse[]` (+ `zalopaySaved/zalopayError/zalopayFieldErrors`). Cấu trúc render:
  - **Cổng cơ bản (SePay)**: `base = configs.find(c => c.gateway === 'sepay' || c.gateway === 'payos' || c.gateway === 'mock') ?? null` → `SepayGatewayBody config={base}` (như cũ) + nút "Tắt cổng cơ bản" (`intent=disable-gateway`, hidden `gateway=sepay`) khi `base?.gateway === 'sepay'`.
  - **Ví điện tử (song song)**: 2 khối MoMo/ZaloPay, mỗi khối: dòng trạng thái `● Đang bật` (khi `configs.some(c => c.gateway === key)`) hoặc `Chưa bật`; body form (`MomoGatewayBody`/`ZalopayGatewayBody` — lưu = bật); nếu đang bật thêm `<Form method="post">` nút "Tắt ví" với hidden `intent=disable-gateway` + `gateway=momo|zalopay`.
  - Bỏ selector 3-lựa-chọn cũ (không còn đúng model).

- [ ] **Step 4: Actions server** — `settings-actions.server.ts`:
  - Nhánh JSON `gateway === 'zalopay'`: validate `zalopayGatewaySettingsFormSchema` → `apiPut('/tenant/gateway-config', {gateway:'zalopay', environment, credentials:{appId,key1,key2}})`, form tag `'zalopay'`.
  - `disable-gateway`: đọc `formData.get('gateway')` → `apiDelete('/tenant/gateway-config' + (g ? `?gateway=${g}` : ''))`.
  - `payment-settings` intent: thêm field `gateway` (hidden input trong `PaymentMethodSettingsCard` form, value = gateway của config base đang truyền vào).

- [ ] **Step 5: `settings.tsx`** — loader: `apiGet<GatewayConfigResponse[]>('/tenant/gateway-config')` → `gatewayConfigs` (array); truyền `configs={gatewayConfigs}` vào `PaymentGatewayCard`; `PaymentMethodSettingsCard` nhận `settings`/`gateway` từ **config base** (`gatewayConfigs.find(c => !['momo','zalopay'].includes(c.gateway))`); map form-tab thêm `zalopay: 'payments'`.

- [ ] **Step 6: Labels** — `constants/payments.ts`: `PAYMENT_GATEWAY_LABEL.zalopay = 'ZaloPay'`; `PAYMENT_METHOD_LABEL.ZALOPAY_WALLET = 'Ví ZaloPay'`.

- [ ] **Step 7: Verify** — `nvm use 22.22.0 && pnpm --filter=@booking/dashboard typecheck && pnpm --filter=@booking/dashboard lint` → exit 0.
- [ ] **Step 8: Commit** — `git commit -m "feat(dashboard): parallel wallet toggles (MoMo/ZaloPay) + zalopay config card"`

---

### Task 7: Storefront + env + docs + full verify

**Files:**
- Modify: `apps/storefront/app/features/checkout/components/checkout-form.tsx`
- Modify: `packages/i18n/src/locales/vi/checkout.ts`, `packages/i18n/src/locales/en/checkout.ts`
- Modify: `.env.example`
- Modify: `docs/superpowers/specs/2026-07-22-momo-gateway-auto-refund-design.md` (mục cập nhật)

- [ ] **Step 1: Checkout form** — import `Smartphone` từ lucide; `PAYMENT_METHODS` thêm:

```ts
zalopay_wallet: { icon: Smartphone, label: 'payment.zaloWallet' },
```
(label union type thêm `'payment.zaloWallet'`).

- [ ] **Step 2: i18n** — `vi/checkout.ts` payment block: `zaloWallet: 'Ví ZaloPay',`; `en/checkout.ts`: `zaloWallet: 'ZaloPay wallet',`.

- [ ] **Step 3: `.env.example`** — nối vào `PAYMENT_REDIRECT_ORIGINS` comment + giá trị:

```
# ZaloPay order_url origins — VERIFY origin thật từ 1 lệnh create sandbox trước khi prod.
PAYMENT_REDIRECT_ORIGINS=...,https://sbgateway.zalopay.vn,https://gateway.zalopay.vn
```

- [ ] **Step 4: Docs** — thêm vào mục "Cập nhật sau merge" của spec MoMo: model grouped-active (BASE đơn + ví song song), ZaloPay dùng chung pipeline, refund async pattern, và 2 điểm verify sandbox (order_url origin, giới hạn ngày refund).

- [ ] **Step 5: Build i18n + full verify**:

```bash
pnpm --filter=@booking/i18n build && pnpm --filter=@booking/contracts build
pnpm turbo typecheck lint build --filter=@booking/api --filter=@booking/dashboard --filter=@booking/storefront
```
Expected: toàn bộ tasks successful (14/14 hoặc hơn), exit 0.

- [ ] **Step 6: Chạy app xác nhận nhanh (mock)** — `docker compose up -d && pnpm dev`; vào Dashboard → Settings → Thanh toán: thấy khối SePay + 2 khối ví; bật MoMo và ZaloPay (creds giả) → GET trả 3 config active; storefront checkout hiện đủ method (mock phục vụ khi dev). Tắt 1 ví → method tương ứng biến mất khỏi public options.
- [ ] **Step 7: Commit** — `git commit -m "feat(storefront): zalopay_wallet method + env origins + docs"`

---

## Ngoài phạm vi (follow-up, KHÔNG làm trong plan này)

- Per-wallet settings UI (đổi refundStrategy/SLA riêng từng ví) — ví dùng default `automatic_preferred`.
- E2E sandbox thật cho cả 2 ví (cần creds + tunnel IPN; **refund sandbox ZaloPay/MoMo có thể bị giới hạn — liên hệ provider**).
- PayOS UI (vẫn không expose trong dashboard, như hiện tại).
- VNPay (spec riêng đã bàn — chưa làm).

## Self-review đã chạy

- Spec coverage: song song ✓ (Task 4+5), toggle settings ✓ (Task 6), SePay như cũ ✓ (chỉ đổi vị trí render + deactivate scope BASE), ZaloPay end-to-end ✓ (Task 2+3+5), storefront method ✓ (Task 7).
- Type consistency: `findActiveAll`/`findActiveBase`/`deactivate(gateway?)`/`updateSettings(tenantId, gateway, settings)` dùng nhất quán Task 4→5→6; `pickConfigForMethod` định nghĩa Task 5 dùng tại chỗ; `GatewayConfigResponse[]` xuyên Task 4→6.
- Placeholder: không còn TBD/TODO; 2 điểm "verify sandbox" là cờ vận hành có chủ đích, không phải lỗ hổng thiết kế.
