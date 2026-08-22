import type { PaymentStatusResult } from '../../domain/ports/payment-gateway.port';

const FINAL_PAYMENT_FAILURE_CODES = new Set([
  98,
  99,
  1001,
  1002,
  1003,
  1004,
  1006,
  1007,
  1017,
  1026,
  2019,
  4001,
  4002,
  4100,
]);

const FINAL_REFUND_FAILURE_CODES = new Set([
  ...FINAL_PAYMENT_FAILURE_CODES,
  1005,
  1081,
  1088,
]);

export function mapMomoPaymentResultCode(
  code: number | undefined,
): PaymentStatusResult['status'] {
  if (code === 0 || code === 9000) return 'succeeded';
  if (code === 1005) return 'expired';
  if (code === 1000 || code === 7000 || code === 7002 || code === undefined) return 'pending';
  if (FINAL_PAYMENT_FAILURE_CODES.has(code)) return 'failed';
  return 'pending';
}

export const isMomoRefundPending = (code: number | undefined): boolean =>
  code === 1000 || code === 7000 || code === 7002;

export const isMomoRefundRetryableFailure = (code: number | undefined): boolean => code === 1080;

/**
 * A refund attempt that MoMo marks final must not be re-posted under the same
 * provider identity. `1080` is intentionally excluded because MoMo explicitly
 * recommends retrying that failure later with a new refund attempt.
 */
export const isMomoRefundManualFailure = (code: number | undefined): boolean =>
  code !== undefined && FINAL_REFUND_FAILURE_CODES.has(code);
