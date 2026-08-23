import type { GatewayPaymentSettings } from '@booking/contracts';
import type { PaymentRecord } from './ports/payment-repository.port';
import type { TenantRefundPolicyRecord } from './ports/refund-policy-repository.port';

/**
 * Read only the policy snapshot frozen onto a Payment. Complete snapshots are
 * authoritative. `(null, null)` identifies a legacy Payment that must fall back
 * to its historical gateway revision. Any half-populated snapshot is corruption
 * and fails closed before gateway/config resolution.
 */
export function paymentRefundPolicySnapshot(
  payment: Pick<PaymentRecord, 'refundStrategySnapshot' | 'manualRefundSlaHoursSnapshot'>,
): TenantRefundPolicyRecord | null {
  const strategy = payment.refundStrategySnapshot ?? null;
  const hours = payment.manualRefundSlaHoursSnapshot ?? null;

  if ((strategy === null) !== (hours === null)) {
    throw new Error('Invalid refund policy snapshot: partially populated');
  }
  if (strategy !== null && hours !== null) {
    return { refundStrategy: strategy, manualRefundSlaHours: hours };
  }
  return null;
}

/**
 * Resolve refund policy with snapshot-first precedence. Callers that need to
 * avoid historical config I/O can call `paymentRefundPolicySnapshot()` first;
 * legacy Payments then pass the exact historical settings here.
 */
export function resolvePaymentRefundPolicy(
  payment: Pick<PaymentRecord, 'refundStrategySnapshot' | 'manualRefundSlaHoursSnapshot'>,
  legacySettings: GatewayPaymentSettings,
): TenantRefundPolicyRecord {
  return (
    paymentRefundPolicySnapshot(payment) ?? {
      refundStrategy: legacySettings.refundStrategy,
      manualRefundSlaHours: legacySettings.manualRefundSlaHours,
    }
  );
}
