import type {
  GatewayConfigResponse,
  PaymentHistoryItem,
  RefundResponse,
  RefundHistoryItem,
} from '@booking/contracts';
import type { GatewayConfigRecord } from '../domain/ports/gateway-config-repository.port';
import type { PaymentHistoryRecord } from '../domain/ports/payment-repository.port';
import type { RefundHistoryRecord, RefundRecord } from '../domain/ports/refund-repository.port';

/**
 * Public shape of a stored gateway config (§11.1). Credentials are never exposed;
 * a stored config is active by definition (there is no disabled state on the record).
 */
export function toGatewayConfigResponse(config: GatewayConfigRecord): GatewayConfigResponse {
  return {
    gateway: config.gateway,
    environment: config.environment,
    isActive: true,
    merchantId: config.gateway === 'sepay' ? (config.credentials.merchantId ?? null) : null,
    partnerCode: config.gateway === 'momo' ? (config.credentials.partnerCode ?? null) : null,
    appId: config.gateway === 'zalopay' ? (config.credentials.appId ?? null) : null,
    settings: config.settings,
  };
}

export function toRefundResponse(refund: RefundRecord): RefundResponse {
  return {
    id: refund.id,
    bookingId: refund.bookingId,
    paymentId: refund.paymentId,
    amount: refund.amount.toString(),
    status: refund.status,
    reason: refund.reason,
    affectsBookingStatus: refund.affectsBookingStatus,
    gatewayRefundId: refund.gatewayRefundId,
    reference: refund.evidence?.reference ?? null,
    executionMode: refund.executionMode,
    dueAt: refund.dueAt?.toISOString() ?? null,
    completedAt: refund.completedAt?.toISOString() ?? null,
  };
}

export function toRefundHistoryItem(refund: RefundHistoryRecord): RefundHistoryItem {
  return {
    ...toRefundResponse(refund),
    bookingCode: refund.bookingCode,
    createdAt: refund.createdAt.toISOString(),
  };
}

export function toPaymentHistoryItem(payment: PaymentHistoryRecord): PaymentHistoryItem {
  return {
    id: payment.id,
    tenantId: payment.tenantId,
    tenantName: payment.tenantName,
    bookingId: payment.bookingId,
    bookingCode: payment.bookingCode,
    gateway: payment.gateway,
    paymentMethod: payment.paymentMethod,
    kind: payment.kind,
    amount: payment.amount.toString(),
    status: payment.status,
    gatewayOrderRef: payment.gatewayOrderRef,
    gatewayTxnId: payment.gatewayTxnId,
    paidAt: payment.paidAt?.toISOString() ?? null,
    createdAt: payment.createdAt.toISOString(),
  };
}
