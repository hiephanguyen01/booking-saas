import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { CancellationPolicyResponse, UpdateCancellationPolicyInput } from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { toCancellationPolicyResponse } from '../listing.mapper';
import {
  CANCELLATION_POLICY_REPOSITORY,
  type ICancellationPolicyRepository,
} from '../../domain/ports/cancellation-policy-repository.port';

/** Updates only tenant-owned policies; partner-owned policies remain outside tenant settings. */
@Injectable()
export class UpdateTenantCancellationPolicyUseCase {
  constructor(
    @Inject(CANCELLATION_POLICY_REPOSITORY)
    private readonly policies: ICancellationPolicyRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  execute(
    tenantId: string,
    id: string,
    input: UpdateCancellationPolicyInput,
  ): Promise<CancellationPolicyResponse> {
    return this.tenantDb.forTenant(tenantId, async (tx) => {
      const existing = await this.policies.findById(tx, id);
      if (!existing) {
        throw new NotFoundException({
          statusCode: 404,
          code: 'CANCELLATION_POLICY_NOT_FOUND',
          message: 'Cancellation policy not found',
        });
      }
      if (existing.partnerId !== null) {
        throw new ForbiddenException({
          statusCode: 403,
          code: 'CANCELLATION_POLICY_NOT_TENANT_OWNED',
          message: 'Only tenant-owned cancellation policies can be edited here',
        });
      }
      const updated = await this.policies.update(tx, id, {
        name: input.name,
        rules: input.rules,
      });
      const defaultId = await this.policies.findTenantDefaultId(tx, tenantId);
      return toCancellationPolicyResponse(updated, defaultId);
    });
  }
}
