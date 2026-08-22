import type { GatewayFailureKind } from '../../domain/errors/gateway-operation-error';
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
  // MoMo system/processing result codes are not proof of a financial failure.
  return 'pending';
}

export function momoOutboundFailureKind(code: number | undefined): GatewayFailureKind {
  if (code === 11 || code === 12 || code === 13) return 'configuration';
  if (code === 10 || code === 43 || code === 47 || code === 1080) return 'retryable';
  return 'final';
}

export const isMomoPending = (code: number | undefined): boolean =>
  code === 1000 || code === 7000 || code === 7002;

export const isMomoRefundAmbiguous = (code: number | undefined): boolean => code === 1081;

export const isMomoRefundTerminalFailure = (code: number | undefined): boolean =>
  code === 1088 || code === 1005 || (code !== undefined && FINAL_PAYMENT_FAILURE_CODES.has(code));
