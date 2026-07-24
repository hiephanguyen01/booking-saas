import { Inject, Injectable } from '@nestjs/common';
import type { CancellationPolicyResponse, CreateCancellationPolicyInput } from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { toCancellationPolicyResponse } from '../listing.mapper';
import {
  CANCELLATION_POLICY_REPOSITORY,
  type ICancellationPolicyRepository,
} from '../../domain/ports/cancellation-policy-repository.port';
import { CancellationPolicy } from '../../domain/entities/cancellation-policy.entity';

/** A partner defines a cancellation policy they own (§11.3); partnerId is forced by the caller. */
@Injectable()
export class CreateCancellationPolicyUseCase {
  constructor(
    @Inject(CANCELLATION_POLICY_REPOSITORY)
    private readonly policies: ICancellationPolicyRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  execute(
    tenantId: string,
    partnerId: string,
    input: CreateCancellationPolicyInput,
  ): Promise<CancellationPolicyResponse> {
    return this.tenantDb.forTenant(tenantId, async (tx) => {
      const created = await this.policies.create(
        tx,
        tenantId,
        CancellationPolicy.open({ partnerId, name: input.name, rules: input.rules }),
      );
      const defaultId = await this.policies.findPartnerDefaultId(tx, partnerId);
      return toCancellationPolicyResponse(created, defaultId);
    });
  }
}
