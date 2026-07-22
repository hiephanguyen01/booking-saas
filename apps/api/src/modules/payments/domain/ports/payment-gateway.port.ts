/**
 * Payment gateway port (TONG-QUAN.md §11.1). A registry binds the tenant's
 * encrypted config to an adapter instance. Gateways normalize their checkout
 * handoff and webhook payloads here so booking never imports a provider SDK.
 * Only the webhook is the source of truth for payment (§11.2).
 */
import type { CheckoutDestination } from '@booking/contracts';
import type { CustomerPaymentMethod } from '@booking/contracts';

export type GatewayKey = 'sepay' | 'payos' | 'momo' | 'zalopay' | 'mock';
export type WebhookEvent = 'succeeded' | 'failed' | 'expired' | 'refunded';

export interface CreatePaymentInput {
  amountVnd: bigint;
  orderCode: string;
  description: string;
  returnUrl: string;
  errorUrl: string;
  cancelUrl: string;
  expiresInSec: number;
  paymentMethod: CustomerPaymentMethod;
}

export interface CreatePaymentResult {
  destination: CheckoutDestination;
  gatewayTxnId?: string;
  gatewayOrderRef?: string;
  paymentMethod?: string;
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
  gatewayOrderRef: string;
  amountVnd: bigint;
  reason: string;
}

export interface RefundResult {
  /** false → the gateway has no refund API; the refund becomes `manual_required`. */
  supported: boolean;
  refundId?: string;
}

export interface PaymentStatusResult {
  status: 'pending' | 'succeeded' | 'failed' | 'expired' | 'refunded';
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
  /** Map the storefront-neutral choice to the provider code persisted with the payment. */
  providerPaymentMethod(method: CustomerPaymentMethod): string;
  /** Unauthenticated read of the gateway txn id from a webhook body (to resolve the tenant). */
  peekReference(rawBody: Buffer): string | null;
  verifyWebhook(rawBody: Buffer, headers: Record<string, string>): WebhookVerification;
  refund(input: RefundInput): Promise<RefundResult>;
  queryPaymentStatus(gatewayTxnId: string): Promise<PaymentStatusResult>;
}
