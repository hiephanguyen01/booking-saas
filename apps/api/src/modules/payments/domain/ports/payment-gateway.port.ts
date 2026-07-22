/**
 * Payment gateway port (TONG-QUAN.md §11.1). A registry binds the tenant's
 * encrypted config to an adapter instance. Gateways normalize their checkout
 * handoff and webhook payloads here so booking never imports a provider SDK.
 * Only the webhook is the source of truth for payment (§11.2).
 */
import type { CheckoutDestination } from '@booking/contracts';

export type GatewayKey = 'sepay' | 'payos' | 'momo' | 'mock';
export type WebhookEvent = 'succeeded' | 'failed' | 'expired';

export interface CreatePaymentInput {
  amountVnd: bigint;
  orderCode: string;
  description: string;
  returnUrl: string;
  errorUrl: string;
  cancelUrl: string;
  expiresInSec: number;
}

export interface CreatePaymentResult {
  destination: CheckoutDestination;
  gatewayTxnId?: string;
  gatewayOrderRef?: string;
}

export interface WebhookVerification {
  valid: boolean;
  event: WebhookEvent;
  gatewayTxnId: string;
  gatewayOrderRef?: string;
  gatewayOrderId?: string;
  paymentMethod?: string;
  amountVnd: bigint;
}

export interface RefundInput {
  gatewayTxnId: string;
  amountVnd: bigint;
  reason: string;
  /**
   * Stable key for gateway-level refund idempotency (e.g. `${bookingId}:${reason}`).
   * Gateways that support refunds (MoMo) use it as their refund requestId/orderId so a
   * retried refund does not double-pay. Ignored by gateways without a refund API.
   */
  idempotencyKey: string;
}

export interface RefundResult {
  /** false → the gateway has no refund API; the refund becomes `manual_required`. */
  supported: boolean;
  refundId?: string;
}

export interface PaymentStatusResult {
  status: 'pending' | 'succeeded' | 'failed' | 'expired';
  amountVnd: bigint;
  /**
   * Provider transaction id, when the status query exposes it (MoMo returns `transId`).
   * Lets reconciliation persist it for a payment recovered without an IPN, so a later
   * refund still has the original txn id to target.
   */
  gatewayTxnId?: string;
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
