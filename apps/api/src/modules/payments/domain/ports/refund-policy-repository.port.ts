import type { RefundStrategy, TenantRefundPolicy } from '@booking/contracts';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';

export const REFUND_POLICY_REPOSITORY = Symbol('REFUND_POLICY_REPOSITORY');

export const DEFAULT_TENANT_REFUND_POLICY: TenantRefundPolicy = {
  refundStrategy: 'manual',
  manualRefundSlaHours: 72,
};

export interface TenantRefundPolicyRecord {
  refundStrategy: RefundStrategy;
  manualRefundSlaHours: number;
}

export interface IRefundPolicyRepository {
  get(tx: PrismaTx, tenantId: string): Promise<TenantRefundPolicyRecord>;
  upsert(
    tx: PrismaTx,
    tenantId: string,
    policy: TenantRefundPolicyRecord,
    actorId: string,
  ): Promise<TenantRefundPolicyRecord>;
}
