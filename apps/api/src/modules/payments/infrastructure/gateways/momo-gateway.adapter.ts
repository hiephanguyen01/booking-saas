import { createHash, createHmac } from 'node:crypto';
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

export interface MomoCredentials {
  partnerCode: string;
  accessKey: string;
  secretKey: string;
  environment: 'sandbox' | 'production';
}

/** MoMo refund limits for a single request (VND). */
const MOMO_MIN_REFUND = 1_000n;
const MOMO_MAX_REFUND = 50_000_000n;

/** MoMo `requestId`/`orderId` are capped at 50 chars — keep our derived ids well under. */
function momoRefundId(idempotencyKey: string): string {
  return `RF${createHash('sha256').update(idempotencyKey).digest('hex').slice(0, 32)}`;
}

/**
 * MoMo gateway adapter (§11.1) — AIO one-time payment (`captureWallet`, redirect)
 * bound to a tenant's decrypted credentials. Unlike SePay/PayOS, MoMo exposes a
 * refund API, so `refund()` actually pushes money back to the customer's MoMo
 * wallet (`supported: true`). The IPN — not the redirect — confirms payment, and
 * carries MoMo's `transId` which we persist so a later refund can target it.
 *
 * NOTE: validated against MoMo's documented signature format; end-to-end proving
 * needs live sandbox credentials (CI covers only the mock gateway).
 */
export class MomoGatewayAdapter implements PaymentGatewayPort {
  readonly key: GatewayKey = 'momo';
  private readonly base: string;

  constructor(private readonly creds: MomoCredentials) {
    this.base =
      creds.environment === 'production'
        ? 'https://payment.momo.vn'
        : 'https://test-payment.momo.vn';
  }

  private sign(raw: string): string {
    return createHmac('sha256', this.creds.secretKey).update(raw).digest('hex');
  }

  private ipnUrl(): string {
    const origin = (process.env.PUBLIC_API_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
    return `${origin}/webhooks/momo`;
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
        orderExpireTime: Math.ceil(input.expiresInSec / 60), // MoMo counts minutes
        lang: 'vi',
        autoCapture: true,
        signature: this.sign(raw),
      }),
    });
    const json = (await res.json()) as { payUrl?: string; resultCode?: number; message?: string };
    if (json.resultCode !== 0 || !json.payUrl) {
      throw new Error(`MoMo create failed (${json.resultCode}): ${json.message ?? 'unknown'}`);
    }
    return { destination: { type: 'redirect', paymentUrl: json.payUrl } };
    // gatewayTxnId is unknown at create time — MoMo only returns transId on the IPN.
    // The minted orderCode is persisted as gatewayOrderRef (checkout fallback) and is
    // what the IPN echoes back, so findByGatewayReference locates the payment.
  }

  peekReference(rawBody: Buffer): string | null {
    try {
      const body = JSON.parse(rawBody.toString('utf8')) as { orderId?: string };
      return body.orderId ?? null;
    } catch {
      return null;
    }
  }

  verifyWebhook(rawBody: Buffer): WebhookVerification {
    const b = JSON.parse(rawBody.toString('utf8')) as Record<string, unknown>;
    const s = (k: string): string => (b[k] === undefined || b[k] === null ? '' : String(b[k]));
    const raw =
      `accessKey=${this.creds.accessKey}&amount=${s('amount')}&extraData=${s('extraData')}` +
      `&message=${s('message')}&orderId=${s('orderId')}&orderInfo=${s('orderInfo')}` +
      `&orderType=${s('orderType')}&partnerCode=${s('partnerCode')}&payType=${s('payType')}` +
      `&requestId=${s('requestId')}&responseTime=${s('responseTime')}` +
      `&resultCode=${s('resultCode')}&transId=${s('transId')}`;
    const valid = this.sign(raw) === s('signature');
    return {
      valid,
      event: Number(b.resultCode) === 0 ? 'succeeded' : 'failed',
      gatewayTxnId: s('transId'), // ← persisted to payment.gateway_txn_id for later refunds
      gatewayOrderRef: s('orderId'),
      paymentMethod: 'MOMO_WALLET',
      amountVnd: BigInt(s('amount') || '0'),
    };
  }

  async refund(input: RefundInput): Promise<RefundResult> {
    if (input.amountVnd < MOMO_MIN_REFUND || input.amountVnd > MOMO_MAX_REFUND) {
      // MoMo caps a single refund at 50M VND; splitting is not supported yet.
      throw new Error(
        `MoMo refund amount ${input.amountVnd} outside [${MOMO_MIN_REFUND}, ${MOMO_MAX_REFUND}]`,
      );
    }
    const { partnerCode, accessKey } = this.creds;
    const id = momoRefundId(input.idempotencyKey); // deterministic → MoMo idempotent on retry
    const amount = Number(input.amountVnd);
    const description = input.reason;
    const raw =
      `accessKey=${accessKey}&amount=${amount}&description=${description}&orderId=${id}` +
      `&partnerCode=${partnerCode}&requestId=${id}&transId=${input.gatewayTxnId}`;

    const res = await fetch(`${this.base}/v2/gateway/api/refund`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        partnerCode,
        orderId: id,
        requestId: id,
        amount,
        transId: Number(input.gatewayTxnId),
        lang: 'vi',
        description,
        signature: this.sign(raw),
      }),
      signal: AbortSignal.timeout(30_000), // MoMo requires ≥30s to respond
    });
    const json = (await res.json()) as { resultCode?: number; transId?: number; message?: string };
    if (json.resultCode !== 0) {
      // Throw (not supported:false) so ExecuteRefundUseCase writes no row and the
      // reconciliation worker re-drives it; the deterministic id keeps retries safe.
      throw new Error(`MoMo refund failed (${json.resultCode}): ${json.message ?? 'unknown'}`);
    }
    return { supported: true, refundId: json.transId !== undefined ? String(json.transId) : id };
  }

  async queryPaymentStatus(reference: string): Promise<PaymentStatusResult> {
    // `reference` is the minted orderId (reconciliation passes gatewayOrderRef).
    const { partnerCode, accessKey } = this.creds;
    const requestId = `QR${createHash('sha256').update(reference).digest('hex').slice(0, 32)}`;
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
    });
    const json = (await res.json()) as { resultCode?: number; amount?: number; transId?: number };
    const status: PaymentStatusResult['status'] =
      json.resultCode === 0 ? 'succeeded' : json.resultCode === 1000 ? 'pending' : 'expired';
    return {
      status,
      amountVnd: BigInt(json.amount ?? 0),
      gatewayTxnId: json.transId !== undefined ? String(json.transId) : undefined,
    };
  }
}
