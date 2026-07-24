import { Inject, Injectable } from '@nestjs/common';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import { PayoutPolicy } from '../../domain/value-objects/payout-policy.value-object';
import {
  PAYOUT_POLICY_STORE,
  type IPayoutPolicyStore,
} from '../../domain/ports/payout-policy-store.port';
export { PayoutPolicy } from '../../domain/value-objects/payout-policy.value-object';

/** Read and normalize the tenant's payout/dispute policy from `tenants.settings`. */
@Injectable()
export class GetPayoutPolicyUseCase {
  constructor(
    @Inject(PAYOUT_POLICY_STORE) private readonly policies: IPayoutPolicyStore,
  ) {}

  async execute(tx: PrismaTx, tenantId: string): Promise<PayoutPolicy> {
    return PayoutPolicy.fromStored(
      await this.policies.readTenantSettings(tx, tenantId),
    );
  }
}
