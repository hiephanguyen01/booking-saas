import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { PayoutPolicyDto } from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { PayoutPolicy } from '../../domain/value-objects/payout-policy.value-object';
import {
  PAYOUT_POLICY_STORE,
  type IPayoutPolicyStore,
} from '../../domain/ports/payout-policy-store.port';

/** Persist normalized dispute/payout policy while preserving unrelated tenant settings. */
@Injectable()
export class UpdatePayoutPolicyUseCase {
  constructor(
    @Inject(PAYOUT_POLICY_STORE) private readonly policies: IPayoutPolicyStore,
    private readonly tenantDb: TenantDbService,
  ) {}

  execute(tenantId: string, input: PayoutPolicyDto): Promise<PayoutPolicyDto> {
    return this.tenantDb.forTenant(tenantId, async (tx) => {
      const policy = PayoutPolicy.define(input);
      if (!(await this.policies.save(tx, tenantId, policy.toStored()))) {
        throw new NotFoundException();
      }
      return policy.toDto();
    });
  }
}
