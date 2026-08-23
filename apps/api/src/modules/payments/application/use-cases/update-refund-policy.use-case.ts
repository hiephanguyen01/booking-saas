import { Inject, Injectable } from '@nestjs/common';
import {
  updateTenantRefundPolicyInputSchema,
  type TenantRefundPolicy,
  type UpdateTenantRefundPolicyInput,
} from '@booking/contracts';
import { TenantContextService } from '../../../../shared/tenant-context/tenant-context.service';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  PAYMENT_CONFIGURATION_LOCK,
  type PaymentConfigurationLockPort,
} from '../../domain/ports/payment-configuration-lock.port';
import {
  REFUND_POLICY_REPOSITORY,
  type IRefundPolicyRepository,
} from '../../domain/ports/refund-policy-repository.port';
import { InvalidRefundPolicy } from '../payment-http-errors';

@Injectable()
export class UpdateRefundPolicyUseCase {
  constructor(
    @Inject(REFUND_POLICY_REPOSITORY)
    private readonly policies: IRefundPolicyRepository,
    @Inject(PAYMENT_CONFIGURATION_LOCK)
    private readonly configurationLock: PaymentConfigurationLockPort,
    private readonly tenantContext: TenantContextService,
    private readonly tenantDb: TenantDbService,
  ) {}

  execute(input: UpdateTenantRefundPolicyInput, actorId: string): Promise<TenantRefundPolicy> {
    const parsed = updateTenantRefundPolicyInputSchema.safeParse(input);
    if (!parsed.success) throw new InvalidRefundPolicy(parsed.error.flatten());
    const tenantId = this.tenantContext.tenantIdOrThrow();
    return this.tenantDb.forTenant(tenantId, async (tx) => {
      await this.configurationLock.acquire(tx, tenantId);
      return this.policies.upsert(tx, tenantId, parsed.data, actorId);
    });
  }
}
