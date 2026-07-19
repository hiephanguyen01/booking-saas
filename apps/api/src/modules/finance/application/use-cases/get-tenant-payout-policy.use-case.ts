import { Injectable } from '@nestjs/common';
import type { PayoutPolicyDto } from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { GetPayoutPolicyUseCase } from './get-payout-policy.use-case';

@Injectable()
export class GetTenantPayoutPolicyUseCase {
  constructor(
    private readonly policy: GetPayoutPolicyUseCase,
    private readonly tenantDb: TenantDbService,
  ) {}

  execute(tenantId: string): Promise<PayoutPolicyDto> {
    return this.tenantDb.forTenant(tenantId, async (tx) => {
      const policy = await this.policy.execute(tx, tenantId);
      return {
        holdingDays: policy.holdingDays,
        minAmount: policy.minAmount.toString(),
        cycle: policy.cycle,
      };
    });
  }
}
