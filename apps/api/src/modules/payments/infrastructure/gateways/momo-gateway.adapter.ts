import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type { CustomerPaymentMethod } from '@booking/contracts';
import type {
  CreatePaymentInput,
  CreatePaymentResult,
  GatewayKey,
  PaymentGatewayPort,
  PaymentStatusResult,
  RefundInput,
  RefundResult,
  WebhookEvent,
  WebhookVerification,
} from '../../domain/ports/payment-gateway.port';
import { MOMO_MAX_PAYMENT_VND, MOMO_MIN_REFUND_VND } from '../../domain/gateway-limits';
import {
  isMomoRefundManualFailure,
  isMomoRefundPending,
  isMomoRefundRetryableFailure,
  mapMomoPaymentResultCode,
} from './momo-result-code';

export interface MomoCredentials {
  partnerCode: string;
  accessKey: string;
  secretKey: string;
  environment: 'sandbox' | 'production';
}

interface MomoRefundTransaction {
  orderId?: string;
  amount?: number;
  resultCode?: number;
  transId?: number;
  createdTime?: number;
}

interface MomoRefundQueryResult {
  resultCode?: number;
  message?: string;
  refundTrans?: MomoRefundTransaction[];
}

/** Keep deterministic provider identities well below MoMo's requestId limit. */
function momoRefundId(idempotencyKey: string, attempt: number): string {
  return `RF${createHash('sha256')
    .update(`${idempotencyKey}:attempt:${attempt}`)
    .digest('hex')
    .slice(0, 32)}`;
}

/** Query requests need fresh requestIds so provider status can advance between polls. */
function queryRequestId(prefix: 'PQ' | 'RQ'): string {
  return `${prefix}${randomUUID().replaceAll('-', '')}`.slice(0, 50);
}

function sameHex(expected: string, actual: string): boolean {
  if (!/^[0-9a-f]+$/i.test(expected) || !/^[0-9a-f]+$/i.test(actual)) return false;
  const left = Buffer.from(expected, 'hex');
  const right = Buffer.from(actual, 'hex');
  return left.length === right.length && timingSafeEqual(left, right);
}

function isPositiveDecimal(value: string): boolean {
  return /^\d+$/.test(value) && BigInt(value) > 0n;
}

function invalidWebhook(): WebhookVerification {
  return {
    valid: false,
    event: 'pending',
    gatewayTxnId: '',
    gatewayOrderRef: undefined,
    paymentMethod: 'MOMO_WALLET',
    amountVnd: 0n,
  };
}

/**
 * MoMo gateway adapter (§11.1) — AIO one-time payment (`captureWallet`, redirect)
 * bound to a tenant's decrypted credentials. The IPN — not the redirect —
 * confirms payment. Refunds use deterministic per-attempt identities and query
 * provider state before retry so a lost response cannot cause a double-refund.
 */
export class MomoGatewayAdapter implements PaymentGatewayPort {
  readonly key: GatewayKey = 'momo';
  readonly checkoutInitiation = 'persist_first' as const;
  readonly reconcileFailedAsTerminal = true;
  private readonly base: string;

  constructor(private readonly creds: MomoCredentials) {
    this.base =
      creds.environment === 'production'
        ? 'https://payment.momo.vn'
        : 'https://test-payment.momo.vn';
  }

  /** MoMo only settles to the customer's MoMo wallet, whatever storefront choice was made. */
  providerPaymentMethod(_method: CustomerPaymentMethod): string {
    return 'MOMO_WALLET';
  }

  private sign(raw: string): string {
    return createHmac('sha256', this.creds.secretKey).update(raw).digest('hex');
  }

  private ipnUrl(): string {
    const configured = process.env.PUBLIC_API_URL ?? 'http://localhost:3000';
    let url: URL;
    try {
      url = new URL(configured);
    } catch {
      throw new Error('Invalid PUBLIC_API_URL for MoMo IPN');
    }

    if (this.creds.environment === 'production') {
      const localHosts = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);
      if (
        url.protocol !== 'https:' ||
        localHosts.has(url.hostname.toLowerCase()) ||
        url.username ||
        url.password
      ) {
        throw new Error('Production MoMo requires a public HTTPS PUBLIC_API_URL');
      }
    }

    return `${url.origin}/webhooks/momo`;
  }

  async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    const { partnerCode, accessKey } = this.creds;
    const orderId = input.orderCode;
    const requestId = input.orderCode;
    const amount = Number(input.amountVnd);
    const orderInfo = input.description;
    const redirectUrl = input.returnUrl;
    const ipnUrl = this.ipnUrl();
    const requestType = 'captureWallet';
    const extraData = '';

    // Raw signature string — fields alphabetical, format fixed by MoMo. Do not reorder.
    const raw =
      `accessKey=${accessKey}&amount=${amount}&extraData=${extraData}&ipnUrl=${ipnUrl}` +
      `&orderId=${orderId}&orderInfo=${orderInfo}&partnerCode=${partnerCode}` +
      `&redirectUrl=${redirectUrl}&requestId=${requestId}&requestType=${requestType}`;

    const res = await fetch(`${this.base}/v2/gateway/api/create`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        partnerCode,
        requestId,
        amount,
        orderId,
        orderInfo,
        redirectUrl,
        ipnUrl,
        requestType,
        extraData,
        orderExpireTime: Math.ceil(input.expiresInSec / 60),
        lang: 'vi',
        autoCapture: true,
        signature: this.sign(raw),
      }),
      signal: AbortSignal.timeout(30_000),
    });
    const json = (await res.json()) as { payUrl?: string; resultCode?: number; message?: string };
    if (!res.ok || json.resultCode !== 0 || !json.payUrl) {
      throw new Error(
        `MoMo create failed http=${res.status} result=${json.resultCode}: ${json.message ?? 'unknown'}`,
      );
    }
    return {
      destination: { type: 'redirect', paymentUrl: json.payUrl },
      paymentMethod: 'MOMO_WALLET',
    };
  }

  peekReference(rawBody: Buffer): string | null {
    try {
      const body = JSON.parse(rawBody.toString('utf8')) as { orderId?: string };
      return typeof body.orderId === 'string' && body.orderId.length > 0 ? body.orderId : null;
    } catch {
      return null;
    }
  }

  verifyWebhook(rawBody: Buffer): WebhookVerification {
    let b: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(rawBody.toString('utf8'));
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return invalidWebhook();
      b = parsed as Record<string, unknown>;
    } catch {
      return invalidWebhook();
    }

    const s = (k: string): string => (b[k] === undefined || b[k] === null ? '' : String(b[k]));
    const raw =
      `accessKey=${this.creds.accessKey}&amount=${s('amount')}&extraData=${s('extraData')}` +
      `&message=${s('message')}&orderId=${s('orderId')}&orderInfo=${s('orderInfo')}` +
      `&orderType=${s('orderType')}&partnerCode=${s('partnerCode')}&payType=${s('payType')}` +
      `&requestId=${s('requestId')}&responseTime=${s('responseTime')}` +
      `&resultCode=${s('resultCode')}&transId=${s('transId')}`;

    const signatureValid = sameHex(this.sign(raw), s('signature'));
    const partnerValid = s('partnerCode') === this.creds.partnerCode;
    const referenceValid = s('orderId').length > 0 && s('requestId') === s('orderId');
    const resultCodeRaw = s('resultCode');
    const resultCode = /^-?\d+$/.test(resultCodeRaw) ? Number(resultCodeRaw) : undefined;
    const status = mapMomoPaymentResultCode(resultCode);
    const event: WebhookEvent =
      status === 'succeeded'
        ? 'succeeded'
        : status === 'expired'
          ? 'expired'
          : status === 'failed'
            ? 'failed'
            : 'pending';
    const amountRaw = s('amount');
    const amountValid = /^\d+$/.test(amountRaw);
    const amountVnd = amountValid ? BigInt(amountRaw) : 0n;
    const transId = s('transId');
    const successTransIdValid = event !== 'succeeded' || isPositiveDecimal(transId);

    return {
      valid:
        signatureValid &&
        partnerValid &&
        referenceValid &&
        resultCode !== undefined &&
        amountValid &&
        successTransIdValid,
      event,
      gatewayTxnId: transId,
      gatewayOrderRef: s('orderId'),
      paymentMethod: 'MOMO_WALLET',
      amountVnd,
    };
  }

  private async queryRefundAttempt(orderId: string): Promise<{
    resultCode: number | undefined;
    attempt: MomoRefundTransaction | undefined;
  }> {
    const { partnerCode, accessKey } = this.creds;
    const requestId = queryRequestId('RQ');
    const raw =
      `accessKey=${accessKey}&orderId=${orderId}&partnerCode=${partnerCode}&requestId=${requestId}`;
    const res = await fetch(`${this.base}/v2/gateway/api/refund/query`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        partnerCode,
        requestId,
        orderId,
        lang: 'vi',
        signature: this.sign(raw),
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`MoMo refund query failed with HTTP ${res.status}`);
    const json = (await res.json()) as MomoRefundQueryResult;
    const attempt = json.refundTrans?.find((item) => item.orderId === orderId);
    return {
      resultCode: attempt?.resultCode ?? json.resultCode,
      attempt,
    };
  }

  async refund(input: RefundInput): Promise<RefundResult> {
    const transId = Number(input.gatewayTxnId);
    if (!Number.isInteger(transId) || transId <= 0) {
      return { supported: false };
    }
    if (input.amountVnd < MOMO_MIN_REFUND_VND || input.amountVnd > MOMO_MAX_PAYMENT_VND) {
      return { supported: false };
    }

    const attempt = input.attempt ?? 0;
    const id = momoRefundId(`${input.gatewayOrderRef}:${input.reason}`, attempt);
    const prior = await this.queryRefundAttempt(id);
    if (prior.resultCode === 0 && prior.attempt) {
      return {
        supported: true,
        refundId: prior.attempt.transId !== undefined ? String(prior.attempt.transId) : id,
      };
    }
    if (isMomoRefundPending(prior.resultCode)) {
      return { supported: true, pending: true, refundId: id };
    }
    if (isMomoRefundRetryableFailure(prior.resultCode)) {
      return attempt === 0
        ? { supported: true, retryAfterSec: 3_600, refundId: id }
        : { supported: false };
    }
    if (isMomoRefundManualFailure(prior.resultCode)) return { supported: false };

    const { partnerCode, accessKey } = this.creds;
    const amount = Number(input.amountVnd);
    const description = input.reason;
    const raw =
      `accessKey=${accessKey}&amount=${amount}&description=${description}&orderId=${id}` +
      `&partnerCode=${partnerCode}&requestId=${id}&transId=${transId}`;

    const res = await fetch(`${this.base}/v2/gateway/api/refund`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        partnerCode,
        orderId: id,
        requestId: id,
        amount,
        transId,
        lang: 'vi',
        description,
        signature: this.sign(raw),
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`MoMo refund failed with HTTP ${res.status}`);
    const json = (await res.json()) as { resultCode?: number; transId?: number; message?: string };
    if (json.resultCode === 0) {
      return { supported: true, refundId: json.transId !== undefined ? String(json.transId) : id };
    }
    if (isMomoRefundPending(json.resultCode)) {
      return { supported: true, pending: true, refundId: id };
    }
    if (isMomoRefundRetryableFailure(json.resultCode)) {
      return attempt === 0
        ? { supported: true, retryAfterSec: 3_600, refundId: id }
        : { supported: false };
    }
    if (isMomoRefundManualFailure(json.resultCode)) return { supported: false };
    throw new Error(`MoMo refund uncertain (${json.resultCode}): ${json.message ?? 'unknown'}`);
  }

  async queryPaymentStatus(reference: string): Promise<PaymentStatusResult> {
    const { partnerCode, accessKey } = this.creds;
    const requestId = queryRequestId('PQ');
    const raw =
      `accessKey=${accessKey}&orderId=${reference}&partnerCode=${partnerCode}&requestId=${requestId}`;
    const res = await fetch(`${this.base}/v2/gateway/api/query`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        partnerCode,
        requestId,
        orderId: reference,
        lang: 'vi',
        signature: this.sign(raw),
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`MoMo query failed with HTTP ${res.status}`);
    const json = (await res.json()) as {
      resultCode?: number;
      amount?: number;
      transId?: number;
      refundTrans?: Array<{ amount?: number; resultCode?: number }>;
    };
    const amountVnd = BigInt(json.amount ?? 0);
    const refundedVnd = (json.refundTrans ?? []).reduce((sum, refund) => {
      if (
        refund.resultCode !== 0 ||
        typeof refund.amount !== 'number' ||
        !Number.isFinite(refund.amount)
      ) {
        return sum;
      }
      return sum + BigInt(refund.amount);
    }, 0n);
    const mapped = mapMomoPaymentResultCode(json.resultCode);
    const gatewayTxnId =
      typeof json.transId === 'number' && Number.isSafeInteger(json.transId) && json.transId > 0
        ? String(json.transId)
        : undefined;
    const completeStatus = mapped === 'succeeded' && !gatewayTxnId ? 'pending' : mapped;
    const status: PaymentStatusResult['status'] =
      completeStatus === 'succeeded' && amountVnd > 0n && refundedVnd >= amountVnd
        ? 'refunded'
        : completeStatus;
    return {
      status,
      amountVnd,
      gatewayTxnId,
    };
  }
}
