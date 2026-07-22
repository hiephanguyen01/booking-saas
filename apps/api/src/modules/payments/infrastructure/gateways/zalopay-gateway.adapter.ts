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
