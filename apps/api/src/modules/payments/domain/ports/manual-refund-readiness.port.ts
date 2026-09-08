import type {
  ManualRefundReadinessCheck,
  ManualRefundReadinessCheckKey,
} from '@booking/contracts';

export type { ManualRefundReadinessCheck, ManualRefundReadinessCheckKey };

export const MANUAL_REFUND_READINESS_PORT = Symbol('MANUAL_REFUND_READINESS_PORT');

export interface ManualRefundReadinessPort {
  inspect(tenantId: string): Promise<ManualRefundReadinessCheck[]>;
}
