import { timingSafeEqual } from 'node:crypto';
import { SePayPgClient } from 'sepay-pg-node';
import type {
  CreatePaymentInput,
  CreatePaymentResult,
  GatewayKey,
  PaymentGatewayPort,
  PaymentStatusResult,
  RefundResult,
  RefundInput,
  RefundStatusInput,
  RefundStatusResult,
  WebhookVerification,
} from '../../domain/ports/payment-gateway.port';
import type { CustomerPaymentMethod } from '@booking/contracts';

export interface SepayCredentials {
  merchantId: string;
  secretKey: string;
  environment: 'sandbox' | 'production';
}

interface SepayIpnBody {
  notification_type?: string;
  order?: {
    id?: string;
    order_id?: string;
    order_status?: string;
    order_currency?: string;
    order_amount?: string;
    order_invoice_number?: string;
  };
  transaction?: {
    id?: string;
    payment_method?: string;
    transaction_id?: string;
    transaction_status?: string;
    transaction_amount?: string;
    transaction_currency?: string;
  };
}

function parseBody(rawBody: Buffer): SepayIpnBody | null {
  try {
    const value: unknown = JSON.parse(rawBody.toString('utf8'));
    return value && typeof value === 'object' ? (value as SepayIpnBody) : null;
  } catch {
    return null;
  }
}

function parseVnd(value: unknown): bigint {
  if (typeof value !== 'string' && typeof value !== 'number') return 0n;
  const normalized = String(value).trim();
  const match = /^(\d+)(?:\.0+)?$/.exec(normalized);
  return match?.[1] ? BigInt(match[1]) : 0n;
}

function sameSecret(expected: string, actual: string | undefined): boolean {
  if (!expected || !actual) return false;
  const left = Buffer.from(expected, 'utf8');
  const right = Buffer.from(actual, 'utf8');
  return left.length === right.length && timingSafeEqual(left, right);
}

export class SepayGatewayAdapter implements PaymentGatewayPort {
  readonly key: GatewayKey = 'sepay';

  constructor(private readonly creds: SepayCredentials) {}

  prepareOrderReference(paymentId: string): string {
    return paymentId;
  }

  providerPaymentMethod(method: CustomerPaymentMethod): string {
    const mapping: Partial<Record<CustomerPaymentMethod, string>> = {
      bank_transfer: 'BANK_TRANSFER',
      napas_qr: 'NAPAS_BANK_TRANSFER',
      international_card: 'CARD',
    };
    const code = mapping[method];
    if (!code) throw new Error(`SePay does not support payment method ${method}`);
    return code;
  }

  createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    if (input.amountVnd <= 0n || input.amountVnd > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error('SePay amount is outside the supported integer range');
    }
    const orderRef = input.gatewayOrderRef ?? input.paymentId;
    const client = new SePayPgClient({
      env: this.creds.environment,
      merchant_id: this.creds.merchantId,
      secret_key: this.creds.secretKey,
    });
    const rawFields = client.checkout.initOneTimePaymentFields({
      operation: 'PURCHASE',
      payment_method: this.providerPaymentMethod(input.paymentMethod) as never,
      order_invoice_number: orderRef,
      order_amount: Number(input.amountVnd),
      currency: 'VND',
      order_description: input.description,
      success_url: input.returnUrl,
      error_url: input.errorUrl,
      cancel_url: input.cancelUrl,
    });
    const fields = Object.fromEntries(
      Object.entries(rawFields)
        .filter((entry): entry is [string, string | number] => entry[1] !== undefined)
        .map(([name, value]) => [name, String(value)]),
    );
    return Promise.resolve({
      destination: {
        type: 'form_post',
        actionUrl: client.checkout.initCheckoutUrl(),
        fields,
      },
      gatewayOrderRef: orderRef,
      paymentMethod: this.providerPaymentMethod(input.paymentMethod),
    });
  }

  peekReference(rawBody: Buffer): string | null {
    return parseBody(rawBody)?.order?.order_invoice_number ?? null;
  }

  verifyWebhook(rawBody: Buffer, headers: Record<string, string>): WebhookVerification {
    const body = parseBody(rawBody);
    const reference = body?.order?.order_invoice_number ?? '';
    const txnId = body?.transaction?.transaction_id ?? body?.transaction?.id ?? reference;
    const currency = body?.transaction?.transaction_currency ?? body?.order?.order_currency;
    const voided = body?.notification_type === 'TRANSACTION_VOID';
    const approved =
      body?.notification_type === 'ORDER_PAID' &&
      body.transaction?.transaction_status === 'APPROVED';
    return {
      valid:
        Boolean(body && reference && txnId && currency === 'VND') &&
        sameSecret(this.creds.secretKey, headers['x-secret-key']),
      event: voided ? 'refunded' : approved ? 'succeeded' : 'failed',
      gatewayTxnId: txnId,
      gatewayOrderRef: reference,
      gatewayOrderId: body?.order?.order_id ?? body?.order?.id,
      paymentMethod: body?.transaction?.payment_method,
      amountVnd: parseVnd(body?.transaction?.transaction_amount ?? body?.order?.order_amount),
    };
  }

  async refund(input: RefundInput): Promise<RefundResult> {
    const base =
      this.creds.environment === 'sandbox'
        ? 'https://pgapi-sandbox.sepay.vn'
        : 'https://pgapi.sepay.vn';
    const auth = Buffer.from(`${this.creds.merchantId}:${this.creds.secretKey}`).toString('base64');
    const response = await fetch(`${base}/v1/order/voidTransaction`, {
      method: 'POST',
      headers: {
        authorization: `Basic ${auth}`,
        accept: 'application/json',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ order_invoice_number: input.gatewayOrderRef }),
    });
    if (response.status === 409) {
      const status = await this.queryPaymentStatus(input.gatewayOrderRef);
      if (status.status === 'refunded') {
        return { status: 'succeeded', refundId: `sepay:void:${input.gatewayOrderRef}` };
      }
      return { status: 'unsupported' };
    }
    if ([400, 403, 404, 422].includes(response.status)) return { status: 'unsupported' };
    if (!response.ok) throw new Error(`SePay void failed with ${response.status}`);
    return { status: 'succeeded', refundId: `sepay:void:${input.gatewayOrderRef}` };
  }

  queryRefundStatus(_input: RefundStatusInput): Promise<RefundStatusResult> {
    // SePay's current void API exposes no dedicated refund-status endpoint.
    return Promise.resolve({ status: 'unsupported' });
  }

  async queryPaymentStatus(orderInvoiceNumber: string): Promise<PaymentStatusResult> {
    const base =
      this.creds.environment === 'sandbox'
        ? 'https://pgapi-sandbox.sepay.vn'
        : 'https://pgapi.sepay.vn';
    const auth = Buffer.from(`${this.creds.merchantId}:${this.creds.secretKey}`).toString('base64');
    const response = await fetch(
      `${base}/v1/order/detail/${encodeURIComponent(orderInvoiceNumber)}`,
      { headers: { authorization: `Basic ${auth}`, accept: 'application/json' } },
    );
    if (!response.ok) throw new Error(`SePay order lookup failed with ${response.status}`);
    const json = (await response.json()) as {
      data?: { order_status?: string; order_amount?: string };
    };
    const orderStatus = json.data?.order_status;
    const status: PaymentStatusResult['status'] =
      orderStatus === 'CAPTURED'
        ? 'succeeded'
        : orderStatus === 'EXPIRED'
          ? 'expired'
          : orderStatus === 'VOIDED'
            ? 'refunded'
            : orderStatus === 'CANCELLED'
              ? 'failed'
              : 'pending';
    return { status, amountVnd: parseVnd(json.data?.order_amount) };
  }
}
