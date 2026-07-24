import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import type { StoredPayoutPolicy } from '../../domain/value-objects/payout-policy.value-object';
import type { IPayoutPolicyStore } from '../../domain/ports/payout-policy-store.port';

@Injectable()
export class PrismaPayoutPolicyStore implements IPayoutPolicyStore {
  async readTenantSettings(tx: PrismaTx, tenantId: string): Promise<unknown> {
    const tenant = await tx.tenant.findUnique({
      where: { id: tenantId },
      select: { settings: true },
    });
    return tenant?.settings;
  }

  async save(
    tx: PrismaTx,
    tenantId: string,
    policy: StoredPayoutPolicy,
  ): Promise<boolean> {
    const tenant = await tx.tenant.findUnique({
      where: { id: tenantId },
      select: { settings: true },
    });
    if (!tenant) return false;

    const settings =
      tenant.settings && typeof tenant.settings === 'object' && !Array.isArray(tenant.settings)
        ? (tenant.settings as Record<string, unknown>)
        : {};
    await tx.tenant.update({
      where: { id: tenantId },
      data: {
        settings: {
          ...settings,
          payout: policy,
        } as unknown as Prisma.InputJsonValue,
      },
    });
    return true;
  }
}
