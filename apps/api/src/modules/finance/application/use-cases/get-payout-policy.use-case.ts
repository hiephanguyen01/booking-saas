import { Injectable } from '@nestjs/common';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import { PayoutPolicy } from '../../domain/value-objects/payout-policy.value-object';
export { PayoutPolicy } from '../../domain/value-objects/payout-policy.value-object';

/** Read and normalize the tenant's payout/dispute policy from `tenants.settings`. */
@Injectable()
export class GetPayoutPolicyUseCase {
  async execute(tx: PrismaTx, tenantId: string): Promise<PayoutPolicy> {
    const tenant = await tx.tenant.findUnique({
      where: { id: tenantId },
      select: { settings: true },
    });
    return PayoutPolicy.fromStored(tenant?.settings);
  }
}
