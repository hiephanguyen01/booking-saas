import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { CancellationPolicyResponse, UpdateCancellationPolicyInput } from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { toCancellationPolicyResponse } from '../listing.mapper';
import {
  CANCELLATION_POLICY_REPOSITORY,
  type ICancellationPolicyRepository,
} from '../../domain/ports/cancellation-policy-repository.port';

@Injectable()
export class UpdateCancellationPolicyUseCase {
  constructor(
    @Inject(CANCELLATION_POLICY_REPOSITORY)
    private readonly policies: ICancellationPolicyRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  execute(
    tenantId: string,
    partnerId: string,
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
      // Only the owning partner may edit; tenant-level (partnerId null) and other
      // partners' policies are read-only to this partner.
      if (existing.partnerId !== partnerId) {
        throw new ForbiddenException({
          statusCode: 403,
          code: 'CANCELLATION_POLICY_NOT_OWNED',
          message: 'You can only edit your own cancellation policies',
        });
      }
      const updated = await this.policies.update(tx, id, {
        name: input.name,
        rules: input.rules,
      });
      const defaultId = await this.policies.findPartnerDefaultId(tx, partnerId);
      return toCancellationPolicyResponse(updated, defaultId);
    });
  }
}
