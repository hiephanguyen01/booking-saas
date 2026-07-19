import { Injectable, NotFoundException } from '@nestjs/common';
import type { PayoutPolicyDto } from '@booking/contracts';
import { Prisma } from '@prisma/client';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';

/** Persist normalized dispute/payout policy while preserving unrelated tenant settings. */
@Injectable()
export class UpdatePayoutPolicyUseCase {
  constructor(private readonly tenantDb: TenantDbService) {}

  execute(tenantId: string, input: PayoutPolicyDto): Promise<PayoutPolicyDto> {
    return this.tenantDb.forTenant(tenantId, async (tx) => {
      const tenant = await tx.tenant.findUnique({ where: { id: tenantId }, select: { settings: true } });
      if (!tenant) throw new NotFoundException();
      const settings =
        tenant.settings && typeof tenant.settings === 'object' && !Array.isArray(tenant.settings)
          ? (tenant.settings as Record<string, unknown>)
          : {};
      await tx.tenant.update({
        where: { id: tenantId },
        data: {
          settings: {
            ...settings,
            payout: input,
          } as Prisma.InputJsonValue,
        },
      });
      return input;
    });
  }
}
