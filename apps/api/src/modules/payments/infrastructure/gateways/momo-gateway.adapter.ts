import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
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
  WebhookEvent,
  WebhookVerification,
} from '../../domain/ports/payment-gateway.port';
import {
  MOMO_MAX_PAYMENT_VND,
  MOMO_MIN_PAYMENT_VND,
  MOMO_MIN_REFUND_VND,
} from '../../domain/gateway-limits';
import { GatewayRequestError, providerJson } from './provider-http';
import {
  isMomoPending,
  isMomoRefundAmbiguous,
  isMomoRefundTerminalFailure,
  mapMomoPaymentResultCode,
  momoOutboundFailureKind,
} from './momo-result-code';

export interface MomoCredentials {
  partnerCode: string;
  accessKey: string;
  secretKey: string;
  environment: 'sandbox' | 'production';
}

const MOMO_TIMEOUT_MS = 30_000;
type MomoIdPrefix = 'MO' | 'MC' | 'MQ' | 'RF' | 'RR' | 'RQ';

interface MomoRefundTransaction {
  orderId?: string;
  amount?: bigint;
  resultCode?: number;
  transId?: string;
}

interface MomoRefundQueryResult {
  resultCode?: number;
  refundTrans: MomoRefundTransaction[];
}

function momoId(prefix: MomoIdPrefix, value: string): string {
  return `${prefix}${createHash('sha256')
    .update(`${prefix}:${value}`)
    .digest('hex')
    .slice(0, 32)}`;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid MoMo response');
  }
  return value as Record<string, unknown>;
}

function integer(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isSafeInteger(value)) return value;
  if (typeof value === 'string' && /^-?\d+$/.test(value)) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : undefined;
  }
  return undefined;
}

function nonNegativeAmount(value: unknown): bigint {
  if (typeof value === 'bigint' && value >= 0n) return value;
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return BigInt(value);
  if (typeof value === 'string' && /^\d+$/.test(value)) return BigInt(value);
  return 0n;
}

function providerId(value: unknown): string | undefined {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) return String(value);
  if (typeof value === 'string' && /^\d+$/.test(value) && BigInt(value) > 0n) return value;
  return undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function sameHex(expected: string, actual: string): boolean {
  if (!/^[0-9a-f]+$/i.test(expected) || !/^[0-9a-f]+$/i.test(actual)) return false;
  const left = Buffer.from(expected, 'hex');
  const right = Buffer.from(actual, 'hex');
  return left.length > 0 && left.length === right.length && timingSafeEqual(left, right);
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

function outboundFailure(code: number | undefined, operation: string): GatewayRequestError {
  return new GatewayRequestError(
    momoOutboundFailureKind(code),
    `MoMo ${operation} request was rejected`,
  );
}

export class MomoGatewayAdapter implements PaymentGatewayPort {
  readonly key: GatewayKey = 'momo';
  private readonly base: string;

  constructor(private readonly creds: MomoCredentials) {
    this.base =
      creds.environment === 'production'
        ? 'https://payment.momo.vn'
        : 'https://test-payment.momo.vn';
  }

  prepareOrderReference(paymentId: string): string {
    return momoId('MO', paymentId);
  }

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
      throw new GatewayRequestError('configuration', 'Invalid PUBLIC_API_URL for MoMo IPN');
    }

    if (this.creds.environment === 'production') {
      const localHosts = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);
      if (
        url.protocol !== 'https:' ||
        localHosts.has(url.hostname.toLowerCase()) ||
        url.username ||
        url.password
      ) {
        throw new GatewayRequestError(
          'configuration',
          'Production MoMo requires a public HTTPS PUBLIC_API_URL',
        );
      }
    }

    return `${url.origin}/webhooks/momo`;
  }

  async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    if (
      input.amountVnd < MOMO_MIN_PAYMENT_VND ||
      input.amountVnd > MOMO_MAX_PAYMENT_VND ||
      input.amountVnd > BigInt(Number.MAX_SAFE_INTEGER)
    ) {
      throw new GatewayRequestError('final', 'MoMo amount is outside the supported range');
    }

    const { partnerCode, accessKey } = this.creds;
    const orderId = input.gatewayOrderRef ?? this.prepareOrderReference(input.paymentId);
    const requestId = momoId('MC', input.paymentId);
    const amount = Number(input.amountVnd);
    const orderInfo = input.description;
    const redirectUrl = input.returnUrl;
    const ipnUrl = this.ipnUrl();
    const requestType = 'captureWallet';
    const extraData = '';
    const raw =
      `accessKey=${accessKey}&amount=${amount}&extraData=${extraData}&ipnUrl=${ipnUrl}` +
      `&orderId=${orderId}&orderInfo=${orderInfo}&partnerCode=${partnerCode}` +
      `&redirectUrl=${redirectUrl}&requestId=${requestId}&requestType=${requestType}`;

    const result = await providerJson({
      url: `${this.base}/v2/gateway/api/create`,
      init: {
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
      },
      timeoutMs: MOMO_TIMEOUT_MS,
      parse: (value) => {
        const body = asRecord(value);
        const code = integer(body.resultCode);
        if (code === undefined) throw new Error('MoMo create response has no result code');
        if (code !== 0) {
          if (isMomoPending(code)) {
            throw new GatewayRequestError('retryable', 'MoMo create is still processing');
          }
          throw outboundFailure(code, 'create');
        }
        const payUrl = stringValue(body.payUrl);
        if (!payUrl) throw new Error('MoMo create response has no payment URL');
        return { payUrl };
      },
    });

    return {
      destination: { type: 'redirect', paymentUrl: result.payUrl },
      gatewayOrderRef: orderId,
      paymentMethod: 'MOMO_WALLET',
    };
  }

  peekReference(rawBody: Buffer): string | null {
    try {
      const body = asRecord(JSON.parse(rawBody.toString('utf8')) as unknown);
      return stringValue(body.orderId) ?? null;
    } catch {
      return null;
    }
  }

  verifyWebhook(rawBody: Buffer): WebhookVerification {
    let body: Record<string, unknown>;
    try {
      body = asRecord(JSON.parse(rawBody.toString('utf8')) as unknown);
    } catch {
      return invalidWebhook();
    }

    const s = (key: string): string =>
      body[key] === undefined || body[key] === null ? '' : String(body[key]);
    const raw =
      `accessKey=${this.creds.accessKey}&amount=${s('amount')}&extraData=${s('extraData')}` +
      `&message=${s('message')}&orderId=${s('orderId')}&orderInfo=${s('orderInfo')}` +
      `&orderType=${s('orderType')}&partnerCode=${s('partnerCode')}&payType=${s('payType')}` +
      `&requestId=${s('requestId')}&responseTime=${s('responseTime')}` +
      `&resultCode=${s('resultCode')}&transId=${s('transId')}`;

    const resultCode = integer(body.resultCode);
    const eventStatus = mapMomoPaymentResultCode(resultCode);
    const event: WebhookEvent =
      eventStatus === 'succeeded'
        ? 'succeeded'
        : eventStatus === 'expired'
          ? 'expired'
          : eventStatus === 'failed'
            ? 'failed'
            : 'pending';
    const amountRaw = s('amount');
    const amountValid = /^\d+$/.test(amountRaw);
    const amountVnd = amountValid ? BigInt(amountRaw) : 0n;
    const orderId = s('orderId');
    const requestId = s('requestId');
    const gatewayTxnId = s('transId');
    const successTransIdValid = event !== 'succeeded' || providerId(gatewayTxnId) !== undefined;

    return {
      valid:
        resultCode !== undefined &&
        sameHex(this.sign(raw), s('signature')) &&
        s('partnerCode') === this.creds.partnerCode &&
        orderId.length > 0 &&
        requestId.length > 0 &&
        requestId.length <= 50 &&
        amountValid &&
        successTransIdValid,
      event,
      gatewayTxnId,
      gatewayOrderRef: orderId || undefined,
      paymentMethod: 'MOMO_WALLET',
      amountVnd,
    };
  }

  private async queryRefund(input: RefundStatusInput): Promise<RefundStatusResult> {
    const { partnerCode, accessKey } = this.creds;
    const orderId = momoId('RF', input.refundId);
    const requestId = momoId('RQ', input.refundId);
    const raw =
      `accessKey=${accessKey}&orderId=${orderId}&partnerCode=${partnerCode}&requestId=${requestId}`;

    const result = await providerJson<MomoRefundQueryResult>({
      url: `${this.base}/v2/gateway/api/refund/query`,
      init: {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          partnerCode,
          requestId,
          orderId,
          lang: 'vi',
          signature: this.sign(raw),
        }),
      },
      timeoutMs: MOMO_TIMEOUT_MS,
      parse: (value) => {
        const body = asRecord(value);
        const code = integer(body.resultCode);
        if (code === undefined) throw new Error('MoMo refund query response has no result code');
        const refundTrans = Array.isArray(body.refundTrans)
          ? body.refundTrans.flatMap((item): MomoRefundTransaction[] => {
              if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
              const row = item as Record<string, unknown>;
              return [
                {
                  orderId: stringValue(row.orderId),
                  amount: nonNegativeAmount(row.amount),
                  resultCode: integer(row.resultCode),
                  transId: providerId(row.transId),
                },
              ];
            })
          : [];
        return { resultCode: code, refundTrans };
      },
    });

    if (result.resultCode !== 0) {
      if (isMomoPending(result.resultCode) || isMomoRefundAmbiguous(result.resultCode)) {
        return { status: 'pending', refundId: orderId };
      }
      const kind = momoOutboundFailureKind(result.resultCode);
      if (kind === 'configuration' || kind === 'retryable') {
        throw outboundFailure(result.resultCode, 'refund query');
      }
      return { status: 'failed', refundId: orderId };
    }

    const attempt = result.refundTrans.find((item) => item.orderId === orderId);
    if (!attempt) return { status: 'pending', refundId: orderId };
    if (attempt.resultCode === 0) {
      return { status: 'succeeded', refundId: attempt.transId ?? orderId };
    }
    if (isMomoPending(attempt.resultCode) || isMomoRefundAmbiguous(attempt.resultCode)) {
      return { status: 'pending', refundId: orderId };
    }
    const kind = momoOutboundFailureKind(attempt.resultCode);
    if (kind === 'configuration' || kind === 'retryable') {
      throw outboundFailure(attempt.resultCode, 'refund query');
    }
    if (isMomoRefundTerminalFailure(attempt.resultCode) || kind === 'final') {
      return { status: 'failed', refundId: orderId };
    }
    return { status: 'pending', refundId: orderId };
  }

  async refund(input: RefundInput): Promise<RefundResult> {
    const transId = providerId(input.gatewayTxnId);
    if (!transId) return { status: 'unsupported' };
    if (
      input.amountVnd < MOMO_MIN_REFUND_VND ||
      input.amountVnd > MOMO_MAX_PAYMENT_VND ||
      input.amountVnd > BigInt(Number.MAX_SAFE_INTEGER)
    ) {
      return { status: 'unsupported' };
    }

    const { partnerCode, accessKey } = this.creds;
    const orderId = momoId('RF', input.refundId);
    const requestId = momoId('RR', input.refundId);
    const amount = Number(input.amountVnd);
    const description = input.reason;
    const raw =
      `accessKey=${accessKey}&amount=${amount}&description=${description}&orderId=${orderId}` +
      `&partnerCode=${partnerCode}&requestId=${requestId}&transId=${transId}`;

    const result = await providerJson({
      url: `${this.base}/v2/gateway/api/refund`,
      init: {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          partnerCode,
          orderId,
          requestId,
          amount,
          transId: Number(transId),
          lang: 'vi',
          description,
          signature: this.sign(raw),
        }),
      },
      timeoutMs: MOMO_TIMEOUT_MS,
      parse: (value) => {
        const body = asRecord(value);
        const code = integer(body.resultCode);
        if (code === undefined) throw new Error('MoMo refund response has no result code');
        return { resultCode: code, transId: providerId(body.transId) };
      },
    });

    if (result.resultCode === 0) {
      return { status: 'succeeded', refundId: result.transId ?? orderId };
    }
    if (isMomoPending(result.resultCode)) {
      return { status: 'pending', refundId: orderId };
    }
    if (isMomoRefundAmbiguous(result.resultCode)) {
      return this.queryRefund({ refundId: input.refundId, gatewayRefundId: orderId });
    }
    const kind = momoOutboundFailureKind(result.resultCode);
    if (kind === 'configuration' || kind === 'retryable') {
      throw outboundFailure(result.resultCode, 'refund');
    }
    if (isMomoRefundTerminalFailure(result.resultCode) || kind === 'final') {
      return { status: 'failed', refundId: orderId };
    }
    return { status: 'pending', refundId: orderId };
  }

  queryRefundStatus(input: RefundStatusInput): Promise<RefundStatusResult> {
    return this.queryRefund(input);
  }

  async queryPaymentStatus(reference: string): Promise<PaymentStatusResult> {
    const { partnerCode, accessKey } = this.creds;
    const requestId = momoId('MQ', reference);
    const raw =
      `accessKey=${accessKey}&orderId=${reference}&partnerCode=${partnerCode}&requestId=${requestId}`;

    const result = await providerJson({
      url: `${this.base}/v2/gateway/api/query`,
      init: {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          partnerCode,
          requestId,
          orderId: reference,
          lang: 'vi',
          signature: this.sign(raw),
        }),
      },
      timeoutMs: MOMO_TIMEOUT_MS,
      parse: (value) => {
        const body = asRecord(value);
        const code = integer(body.resultCode);
        if (code === undefined) throw new Error('MoMo query response has no result code');
        const refunds = Array.isArray(body.refundTrans)
          ? body.refundTrans.flatMap((item): Array<{ amount: bigint; resultCode?: number }> => {
              if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
              const row = item as Record<string, unknown>;
              return [{ amount: nonNegativeAmount(row.amount), resultCode: integer(row.resultCode) }];
            })
          : [];
        return {
          resultCode: code,
          amountVnd: nonNegativeAmount(body.amount),
          gatewayTxnId: providerId(body.transId),
          refunds,
        };
      },
    });

    const kind = momoOutboundFailureKind(result.resultCode);
    if (kind === 'configuration' || kind === 'retryable') {
      throw outboundFailure(result.resultCode, 'query');
    }

    const mapped = mapMomoPaymentResultCode(result.resultCode);
    const completeStatus = mapped === 'succeeded' && !result.gatewayTxnId ? 'pending' : mapped;
    const refundedVnd = result.refunds.reduce(
      (sum, item) => (item.resultCode === 0 ? sum + item.amount : sum),
      0n,
    );
    const status: PaymentStatusResult['status'] =
      completeStatus === 'succeeded' &&
      result.amountVnd > 0n &&
      refundedVnd >= result.amountVnd
        ? 'refunded'
        : completeStatus;

    return {
      status,
      amountVnd: result.amountVnd,
      gatewayTxnId: result.gatewayTxnId,
    };
  }
}
