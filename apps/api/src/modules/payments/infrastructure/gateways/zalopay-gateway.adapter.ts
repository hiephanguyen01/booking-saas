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
  RefundStatusInput,
  RefundStatusResult,
  WebhookVerification,
} from '../../domain/ports/payment-gateway.port';

export interface ZalopayCredentials {
  appId: string;
  key1: string;
  key2: string;
  environment: 'sandbox' | 'production';
}

function vnDatePrefix(daysAgo = 0): string {
  const vn = new Date(Date.now() + 7 * 3_600_000 - daysAgo * 86_400_000);
  return vn.toISOString().slice(2, 10).replaceAll('-', '');
}

function shortHash(value: string, length: number): string {
  return createHash('sha256').update(value).digest('hex').slice(0, length);
}

const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export class ZalopayGatewayAdapter implements PaymentGatewayPort {
  readonly key: GatewayKey = 'zalopay';
  private readonly base: string;

  constructor(private readonly creds: ZalopayCredentials) {
    this.base =
      creds.environment === 'production'
        ? 'https://openapi.zalopay.vn'
        : 'https://sb-openapi.zalopay.vn';
  }

  /** ZaloPay's date-prefixed provider ref remains adapter-owned until its dedicated hardening. */
  prepareOrderReference(_paymentId: string): null {
    return null;
  }

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
    const stableInput = input.gatewayOrderRef ?? input.paymentId;
    const appTransId = `${vnDatePrefix()}_${shortHash(stableInput, 24)}`;
    const appTime = Date.now();
    const amount = Number(input.amountVnd);
    const embedData = JSON.stringify({ redirecturl: input.returnUrl });
    const item = '[]';
    const raw = `${appId}|${appTransId}|${stableInput}|${amount}|${appTime}|${embedData}|${item}`;
    const res = await fetch(`${this.base}/v2/create`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        app_id: Number(appId),
        app_user: stableInput,
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
      event: 'succeeded',
      gatewayTxnId: data.zp_trans_id !== undefined ? String(data.zp_trans_id) : '',
      gatewayOrderRef: data.app_trans_id,
      paymentMethod: 'ZALOPAY_WALLET',
      amountVnd: BigInt(data.amount ?? 0),
    };
  }

  private refundId(orderRef: string, reason: string, daysAgo = 0): string {
    return `${vnDatePrefix(daysAgo)}_${this.creds.appId}_${shortHash(`${orderRef}:${reason}`, 20)}`;
  }

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
    if (!/^\d+$/.test(input.gatewayTxnId)) return { status: 'unsupported' };
    for (const daysAgo of [0, 1]) {
      const id = this.refundId(input.gatewayOrderRef, input.reason, daysAgo);
      const code = await this.queryRefund(id);
      if (code === 1) return { status: 'succeeded', refundId: id };
      if (code === 3) return { status: 'pending', refundId: id };
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
      return { status: 'succeeded', refundId: String(json.refund_id ?? mRefundId) };
    }
    if (json.return_code === 3) {
      for (let i = 0; i < 3; i++) {
        await wait(2_000);
        const code = await this.queryRefund(mRefundId);
        if (code === 1) return { status: 'succeeded', refundId: mRefundId };
        if (code === 2) return { status: 'failed', refundId: mRefundId };
      }
      return { status: 'pending', refundId: mRefundId };
    }
    return { status: 'unsupported' };
  }

  async queryRefundStatus(input: RefundStatusInput): Promise<RefundStatusResult> {
    if (!input.gatewayRefundId) return { status: 'unsupported' };
    const code = await this.queryRefund(input.gatewayRefundId);
    if (code === 1) return { status: 'succeeded', refundId: input.gatewayRefundId };
    if (code === 3) return { status: 'pending', refundId: input.gatewayRefundId };
    if (code === 2) return { status: 'failed', refundId: input.gatewayRefundId };
    return { status: 'unsupported', refundId: input.gatewayRefundId };
  }

  async queryPaymentStatus(reference: string): Promise<PaymentStatusResult> {
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
      json.return_code === 1
        ? 'succeeded'
        : json.return_code === 2
          ? 'expired'
          : 'pending';
    return {
      status,
      amountVnd: BigInt(json.amount ?? 0),
      gatewayTxnId: json.zp_trans_id !== undefined ? String(json.zp_trans_id) : undefined,
    };
  }
}