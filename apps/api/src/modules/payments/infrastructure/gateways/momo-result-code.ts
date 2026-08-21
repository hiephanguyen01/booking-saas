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

export const isMomoRefundManualFailure = (code: number | undefined): boolean =>
  code === 1081 || code === 1088;
