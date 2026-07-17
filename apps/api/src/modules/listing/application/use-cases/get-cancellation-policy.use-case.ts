import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { CancellationPolicyResponse } from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { toCancellationPolicyResponse } from '../listing.mapper';
import {
  CANCELLATION_POLICY_REPOSITORY,
  type ICancellationPolicyRepository,
} from '../../domain/ports/cancellation-policy-repository.port';

@Injectable()
export class GetCancellationPolicyUseCase {
  constructor(
    @Inject(CANCELLATION_POLICY_REPOSITORY)
    private readonly policies: ICancellationPolicyRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  execute(tenantId: string, partnerId: string, id: string): Promise<CancellationPolicyResponse> {
    return this.tenantDb.forTenant(tenantId, async (tx) => {
      const policy = await this.policies.findById(tx, id);
      // Visible when tenant-level (shared) or owned by the caller; another partner's
      // policy is reported as not-found so its existence is never leaked.
      if (!policy || (policy.partnerId !== null && policy.partnerId !== partnerId)) {
        throw new NotFoundException({
          statusCode: 404,
          code: 'CANCELLATION_POLICY_NOT_FOUND',
          message: 'Cancellation policy not found',
        });
      }
      const defaultId = await this.policies.findPartnerDefaultId(tx, partnerId);
      return toCancellationPolicyResponse(policy, defaultId);
    });
  }
}
