import { createHmac } from 'node:crypto';
import type {
  CreatePaymentInput,
  CreatePaymentResult,
  GatewayKey,
  PaymentGatewayPort,
  PaymentStatusResult,
  RefundResult,
  WebhookVerification,
} from '../../domain/ports/payment-gateway.port';

export interface PayosCredentials {
  clientId: string;
  apiKey: string;
  checksumKey: string;
  baseUrl?: string;
}

/** Sorted `k=v&k=v` for PayOS HMAC-SHA256 signing (keys alphabetical). */
function signedPayload(data: Record<string, unknown>, checksumKey: string): string {
  const query = Object.keys(data)
    .sort()
    .map((k) => `${k}=${data[k] ?? ''}`)
    .join('&');
  return createHmac('sha256', checksumKey).update(query).digest('hex');
}

/**
 * PayOS adapter (§11.1) — bound to a tenant's credentials. Implements PayOS's
 * documented payment-link + HMAC-SHA256 webhook checksum. PayOS has no refund
 * API, so refunds fall back to `manual_required`. NOTE: validated end-to-end
 * only with live sandbox keys; CI covers the mock gateway.
 */
export class PayosGatewayAdapter implements PaymentGatewayPort {
  readonly key: GatewayKey = 'payos';
  private readonly base: string;

  constructor(private readonly creds: PayosCredentials) {
    this.base = creds.baseUrl ?? 'https://api-merchant.payos.vn';
  }

  async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    const body = {
      orderCode: Number(input.orderCode),
      amount: Number(input.amountVnd),
      description: input.description.slice(0, 25),
      cancelUrl: input.cancelUrl,
      returnUrl: input.returnUrl,
    };
    const signature = signedPayload(body, this.creds.checksumKey);
    const res = await fetch(`${this.base}/v2/payment-requests`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-client-id': this.creds.clientId,
        'x-api-key': this.creds.apiKey,
      },
      body: JSON.stringify({ ...body, signature }),
    });
    const json = (await res.json()) as { data?: { checkoutUrl: string; paymentLinkId: string } };
    if (!json.data) throw new Error('PayOS did not return a payment link');
    return {
      destination: { type: 'redirect', paymentUrl: json.data.checkoutUrl },
      gatewayTxnId: json.data.paymentLinkId,
    };
  }

  peekReference(rawBody: Buffer): string | null {
    try {
      const body = JSON.parse(rawBody.toString('utf8')) as { data?: { paymentLinkId?: string } };
      return body.data?.paymentLinkId ?? null;
    } catch {
      return null;
    }
  }

  verifyWebhook(rawBody: Buffer): WebhookVerification {
    const body = JSON.parse(rawBody.toString('utf8')) as {
      data: Record<string, unknown> & { paymentLinkId: string; amount: number; code?: string };
      signature: string;
    };
    const valid = signedPayload(body.data, this.creds.checksumKey) === body.signature;
    return {
      valid,
      event: body.data.code === '00' ? 'succeeded' : 'failed',
      gatewayTxnId: body.data.paymentLinkId,
      amountVnd: BigInt(body.data.amount ?? 0),
    };
  }

  refund(): Promise<RefundResult> {
    return Promise.resolve({ supported: false }); // PayOS has no refund API → manual_required
  }

  async queryPaymentStatus(gatewayTxnId: string): Promise<PaymentStatusResult> {
    const res = await fetch(`${this.base}/v2/payment-requests/${gatewayTxnId}`, {
      headers: { 'x-client-id': this.creds.clientId, 'x-api-key': this.creds.apiKey },
    });
    const json = (await res.json()) as { data?: { status: string; amount: number } };
    const status =
      json.data?.status === 'PAID'
        ? 'succeeded'
        : json.data?.status === 'EXPIRED'
          ? 'expired'
          : 'pending';
    return { status, amountVnd: BigInt(json.data?.amount ?? 0) };
  }
}
