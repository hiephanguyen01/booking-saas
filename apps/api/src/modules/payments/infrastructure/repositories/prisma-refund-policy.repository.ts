import { Injectable } from '@nestjs/common';
import { tenantRefundPolicySchema } from '@booking/contracts';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import {
  DEFAULT_TENANT_REFUND_POLICY,
  type IRefundPolicyRepository,
  type TenantRefundPolicyRecord,
} from '../../domain/ports/refund-policy-repository.port';

@Injectable()
export class PrismaRefundPolicyRepository implements IRefundPolicyRepository {
  async get(tx: PrismaTx, tenantId: string): Promise<TenantRefundPolicyRecord> {
    const row = await tx.tenantRefundPolicy.findUnique({ where: { tenantId } });
    if (!row) return { ...DEFAULT_TENANT_REFUND_POLICY };
    return tenantRefundPolicySchema.parse({
      refundStrategy: row.refundStrategy,
      manualRefundSlaHours: row.manualRefundSlaHours,
    });
  }

  async upsert(
    tx: PrismaTx,
    tenantId: string,
    policy: TenantRefundPolicyRecord,
    actorId: string,
  ): Promise<TenantRefundPolicyRecord> {
    const row = await tx.tenantRefundPolicy.upsert({
      where: { tenantId },
      create: {
        tenantId,
        refundStrategy: policy.refundStrategy,
        manualRefundSlaHours: policy.manualRefundSlaHours,
        updatedBy: actorId,
      },
      update: {
        refundStrategy: policy.refundStrategy,
        manualRefundSlaHours: policy.manualRefundSlaHours,
        updatedBy: actorId,
      },
    });
    return tenantRefundPolicySchema.parse({
      refundStrategy: row.refundStrategy,
      manualRefundSlaHours: row.manualRefundSlaHours,
    });
  }
}
