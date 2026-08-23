import type { GatewayPaymentSettings } from '@booking/contracts';
import type { PaymentRecord } from './ports/payment-repository.port';
import type { TenantRefundPolicyRecord } from './ports/refund-policy-repository.port';

/**
 * Resolve the refund policy frozen onto a Payment. New Payments must carry a
 * complete snapshot; legacy Payments fall back to the historical gateway
 * settings supplied by resolveForPayment(). A partial snapshot is corruption and
 * fails closed instead of guessing which half is authoritative.
 */
export function resolvePaymentRefundPolicy(
  payment: Pick<PaymentRecord, 'refundStrategySnapshot' | 'manualRefundSlaHoursSnapshot'>,
  legacySettings: GatewayPaymentSettings,
): TenantRefundPolicyRecord {
  const strategy = payment.refundStrategySnapshot ?? null;
  const hours = payment.manualRefundSlaHoursSnapshot ?? null;

  if ((strategy === null) !== (hours === null)) {
    throw new Error('Invalid refund policy snapshot: partially populated');
  }
  if (strategy !== null && hours !== null) {
    return { refundStrategy: strategy, manualRefundSlaHours: hours };
  }
  return {
    refundStrategy: legacySettings.refundStrategy,
    manualRefundSlaHours: legacySettings.manualRefundSlaHours,
  };
}
