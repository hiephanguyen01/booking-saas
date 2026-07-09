/**
 * Payment gateway port (TONG-QUAN.md §11.1). Adapters: `mock` (dev/test/E2E),
 * `payos` (live). A registry binds the tenant's config to an adapter instance.
 * Only the webhook is the source of truth for payment (§11.2).
 */
export type GatewayKey = 'payos' | 'mock';
export type WebhookEvent = 'succeeded' | 'failed' | 'expired';

export interface CreatePaymentInput {
  amountVnd: bigint;
  orderCode: string;
  description: string;
  returnUrl: string;
  cancelUrl: string;
  expiresInSec: number;
}

export interface CreatePaymentResult {
  paymentUrl: string;
  gatewayTxnId: string;
}

export interface WebhookVerification {
  valid: boolean;
  event: WebhookEvent;
  gatewayTxnId: string;
  amountVnd: bigint;
}

export interface RefundInput {
  gatewayTxnId: string;
  amountVnd: bigint;
  reason: string;
}

export interface RefundResult {
  /** false → the gateway has no refund API; the refund becomes `manual_required`. */
  supported: boolean;
  refundId?: string;
}

export interface PaymentStatusResult {
  status: 'pending' | 'succeeded' | 'failed' | 'expired';
  amountVnd: bigint;
}

export interface PaymentGatewayPort {
  readonly key: GatewayKey;
  createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult>;
  /** Unauthenticated read of the gateway txn id from a webhook body (to resolve the tenant). */
  peekReference(rawBody: Buffer): string | null;
  verifyWebhook(rawBody: Buffer, headers: Record<string, string>): WebhookVerification;
  refund(input: RefundInput): Promise<RefundResult>;
  queryPaymentStatus(gatewayTxnId: string): Promise<PaymentStatusResult>;
}
