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
  WebhookVerification,
} from '../../domain/ports/payment-gateway.port';
import { GatewayRequestError, providerJson } from './provider-http';

export interface PayosCredentials {
  clientId: string;
  apiKey: string;
  checksumKey: string;
}

const PAYOS_API_BASE = 'https://api-merchant.payos.vn';
const PAYOS_CHECKOUT_BASE = 'https://pay.payos.vn/web';
const PAYOS_TIMEOUT_MS = 30_000;
const MASK_52 = (1n << 52n) - 1n;

interface PayosPaymentData {
  id: string;
  orderCode: number;
  amount: number;
  amountPaid: number | null;
  status: string;
}

interface PayosCreateData extends PayosPaymentData {
  paymentLinkId: string;
}

/** Sorted `k=v&k=v` for payOS HMAC-SHA256 signing (keys alphabetical). */
function signedPayload(data: Record<string, unknown>, checksumKey: string): string {
  const query = Object.keys(data)
    .sort()
    .map((k) => `${k}=${data[k] ?? ''}`)
    .join('&');
  return createHmac('sha256', checksumKey).update(query).digest('hex');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function parsePositiveSafeInteger(value: unknown, field: string): number {
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) {
    throw new GatewayRequestError('final', `payOS returned an invalid ${field}`);
  }
  return number;
}

function parseOptionalNonNegativeSafeInteger(value: unknown, field: string): number | null {
  if (value === undefined || value === null) return null;
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(number) || number < 0) {
    throw new GatewayRequestError('final', `payOS returned an invalid ${field}`);
  }
  return number;
}

function parsePaymentData(value: unknown): PayosPaymentData {
  if (!isRecord(value) || value.code !== '00' || !isRecord(value.data)) {
    throw new GatewayRequestError('final', 'payOS rejected the payment request');
  }
  const id = typeof value.data.id === 'string' ? value.data.id : '';
  const status = typeof value.data.status === 'string' ? value.data.status : '';
  if (!id || !status) {
    throw new GatewayRequestError('retryable', 'payOS returned an incomplete payment response');
  }
  return {
    id,
    orderCode: parsePositiveSafeInteger(value.data.orderCode, 'orderCode'),
    amount: parsePositiveSafeInteger(value.data.amount, 'amount'),
    amountPaid: parseOptionalNonNegativeSafeInteger(value.data.amountPaid, 'amountPaid'),
    status,
  };
}

function parseCreateData(value: unknown): PayosCreateData {
  if (!isRecord(value) || value.code !== '00' || !isRecord(value.data)) {
    throw new GatewayRequestError('final', 'payOS rejected the payment request');
  }
  const paymentLinkId =
    typeof value.data.paymentLinkId === 'string' ? value.data.paymentLinkId : '';
  if (!paymentLinkId) {
    throw new GatewayRequestError('retryable', 'payOS returned an incomplete payment response');
  }
  const status = typeof value.data.status === 'string' ? value.data.status : 'PENDING';
  return {
    id: paymentLinkId,
    paymentLinkId,
    orderCode: parsePositiveSafeInteger(value.data.orderCode, 'orderCode'),
    amount: parsePositiveSafeInteger(value.data.amount, 'amount'),
    amountPaid: parseOptionalNonNegativeSafeInteger(value.data.amountPaid, 'amountPaid'),
    status,
  };
}

function safeHexEqual(expectedHex: string, actualHex: unknown): boolean {
  if (typeof actualHex !== 'string' || !/^[0-9a-fA-F]+$/.test(actualHex)) return false;
  if (!/^[0-9a-fA-F]+$/.test(expectedHex)) return false;
  const expected = Buffer.from(expectedHex, 'hex');
  const actual = Buffer.from(actualHex, 'hex');
  return expected.length > 0 && expected.length === actual.length && timingSafeEqual(expected, actual);
}

function hostedCheckout(paymentLinkId: string): CreatePaymentResult['destination'] {
  return {
    type: 'redirect',
    paymentUrl: `${PAYOS_CHECKOUT_BASE}/${encodeURIComponent(paymentLinkId)}`,
  };
}

export class PayosGatewayAdapter implements PaymentGatewayPort {
  readonly key: GatewayKey = 'payos';

  constructor(private readonly creds: PayosCredentials) {}

  prepareOrderReference(paymentId: string): string {
    const digest = createHash('sha256').update(`payos-order:${paymentId}`).digest();
    const value = digest.readBigUInt64BE(0) & MASK_52;
    return (value === 0n ? 1n : value).toString();
  }

  providerPaymentMethod(method: CustomerPaymentMethod): string {
    if (method !== 'bank_transfer') throw new Error('payOS only supports bank transfer checkout');
    return 'BANK_TRANSFER';
  }

  private headers(): Record<string, string> {
    return {
      'x-client-id': this.creds.clientId,
      'x-api-key': this.creds.apiKey,
    };
  }

  private parsePersistedOrderCode(reference: string | null): number {
    if (!reference || !/^\d+$/.test(reference)) {
      throw new GatewayRequestError('final', 'payOS checkout is missing a valid order reference');
    }
    const orderCode = Number(reference);
    if (!Number.isSafeInteger(orderCode) || orderCode <= 0) {
      throw new GatewayRequestError('final', 'payOS checkout order reference is outside the safe integer range');
    }
    return orderCode;
  }

  private async lookup(reference: string): Promise<PayosPaymentData | null> {
    try {
      return await providerJson({
        url: `${PAYOS_API_BASE}/v2/payment-requests/${encodeURIComponent(reference)}`,
        init: { headers: this.headers() },
        timeoutMs: PAYOS_TIMEOUT_MS,
        parse: parsePaymentData,
      });
    } catch (error) {
      if (error instanceof GatewayRequestError && error.status === 404) return null;
      throw error;
    }
  }

  private validateExisting(
    data: PayosPaymentData,
    orderCode: number,
    expectedAmount: bigint,
  ): void {
    if (data.orderCode !== orderCode || BigInt(data.amount) !== expectedAmount) {
      throw new GatewayRequestError('final', 'payOS returned a conflicting payment resource');
    }
    if (data.status === 'CANCELLED' || data.status === 'EXPIRED') {
      throw new GatewayRequestError('final', 'payOS payment resource is no longer payable');
    }
  }

  private existingResult(
    data: PayosPaymentData,
    orderCode: number,
    input: CreatePaymentInput,
  ): CreatePaymentResult {
    this.validateExisting(data, orderCode, input.amountVnd);
    return {
      destination: hostedCheckout(data.id),
      gatewayTxnId: data.id,
      gatewayOrderRef: String(orderCode),
      paymentMethod: this.providerPaymentMethod(input.paymentMethod),
    };
  }

  async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    const orderCode = this.parsePersistedOrderCode(input.gatewayOrderRef);
    if (input.amountVnd <= 0n || input.amountVnd > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new GatewayRequestError('final', 'payOS amount is outside the supported integer range');
    }

    const existing = await this.lookup(String(orderCode));
    if (existing) return this.existingResult(existing, orderCode, input);

    const body = {
      orderCode,
      amount: Number(input.amountVnd),
      // payOS documents a 9-character limit for the broadest bank-account compatibility.
      description: input.description.slice(0, 9),
      cancelUrl: input.cancelUrl,
      returnUrl: input.returnUrl,
    };
    const signature = signedPayload(body, this.creds.checksumKey);

    let created: PayosCreateData;
    try {
      created = await providerJson({
        url: `${PAYOS_API_BASE}/v2/payment-requests`,
        init: {
          method: 'POST',
          headers: {
            ...this.headers(),
            'content-type': 'application/json',
          },
          body: JSON.stringify({ ...body, signature }),
        },
        timeoutMs: PAYOS_TIMEOUT_MS,
        parse: parseCreateData,
      });
    } catch (error) {
      // Two requests may claim the same durable Payment in Phase A and race after
      // the transaction is released. If both initial lookups miss, one POST can win
      // while the other gets a duplicate/final error or loses its response. Re-read
      // the stable orderCode before surfacing the error so both requests converge on
      // the same provider resource. Configuration failures are not recoverable this way.
      if (error instanceof GatewayRequestError && error.kind !== 'configuration') {
        try {
          const recovered = await this.lookup(String(orderCode));
          if (recovered) return this.existingResult(recovered, orderCode, input);
        } catch (lookupError) {
          if (
            lookupError instanceof GatewayRequestError &&
            lookupError.kind === 'final' &&
            lookupError.status !== 404
          ) {
            throw lookupError;
          }
        }
      }
      throw error;
    }

    this.validateExisting(created, orderCode, input.amountVnd);
    return {
      destination: hostedCheckout(created.paymentLinkId),
      gatewayTxnId: created.paymentLinkId,
      gatewayOrderRef: String(orderCode),
      paymentMethod: this.providerPaymentMethod(input.paymentMethod),
    };
  }

  peekReference(rawBody: Buffer): string | null {
    try {
      const body = JSON.parse(rawBody.toString('utf8')) as { data?: { orderCode?: unknown } };
      const orderCode = body.data?.orderCode;
      if (typeof orderCode !== 'number' && typeof orderCode !== 'string') return null;
      const normalized = String(orderCode);
      return /^\d+$/.test(normalized) ? normalized : null;
    } catch {
      return null;
    }
  }

  verifyWebhook(rawBody: Buffer): WebhookVerification {
    const body = JSON.parse(rawBody.toString('utf8')) as {
      data: Record<string, unknown> & {
        orderCode?: unknown;
        paymentLinkId?: unknown;
        amount?: unknown;
        code?: unknown;
      };
      signature?: unknown;
    };
    const orderCode = parsePositiveSafeInteger(body.data?.orderCode, 'webhook orderCode');
    const amount = parsePositiveSafeInteger(body.data?.amount, 'webhook amount');
    const paymentLinkId =
      typeof body.data?.paymentLinkId === 'string' ? body.data.paymentLinkId : String(orderCode);
    const expected = signedPayload(body.data, this.creds.checksumKey);
    return {
      valid: safeHexEqual(expected, body.signature),
      event: body.data?.code === '00' ? 'succeeded' : 'failed',
      gatewayTxnId: paymentLinkId,
      gatewayOrderRef: String(orderCode),
      amountVnd: BigInt(amount),
    };
  }

  refund(_input: RefundInput): Promise<RefundResult> {
    return Promise.resolve({ status: 'unsupported' });
  }

  queryRefundStatus(_input: RefundStatusInput): Promise<RefundStatusResult> {
    return Promise.resolve({ status: 'unsupported' });
  }

  async queryPaymentStatus(reference: string): Promise<PaymentStatusResult> {
    const data = await this.lookup(reference);
    if (!data) return { status: 'pending', amountVnd: 0n };
    const status: PaymentStatusResult['status'] =
      data.status === 'PAID'
        ? 'succeeded'
        : data.status === 'CANCELLED' || data.status === 'EXPIRED'
          ? 'expired'
          : 'pending';
    const observedAmount =
      status === 'succeeded' && data.amountPaid !== null ? data.amountPaid : data.amount;
    return { status, amountVnd: BigInt(observedAmount) };
  }
}