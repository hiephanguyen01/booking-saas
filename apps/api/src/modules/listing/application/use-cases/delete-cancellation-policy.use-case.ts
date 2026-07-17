import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  CANCELLATION_POLICY_REPOSITORY,
  type ICancellationPolicyRepository,
} from '../../domain/ports/cancellation-policy-repository.port';

/** Delete a partner-owned policy; blocked while any listing still points at it directly. */
@Injectable()
export class DeleteCancellationPolicyUseCase {
  constructor(
    @Inject(CANCELLATION_POLICY_REPOSITORY)
    private readonly policies: ICancellationPolicyRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(tenantId: string, partnerId: string, id: string): Promise<void> {
    await this.tenantDb.forTenant(tenantId, async (tx) => {
      const existing = await this.policies.findById(tx, id);
      if (!existing) {
        throw new NotFoundException({
          statusCode: 404,
          code: 'CANCELLATION_POLICY_NOT_FOUND',
          message: 'Cancellation policy not found',
        });
      }
      if (existing.partnerId !== partnerId) {
        throw new ForbiddenException({
          statusCode: 403,
          code: 'CANCELLATION_POLICY_NOT_OWNED',
          message: 'You can only delete your own cancellation policies',
        });
      }
      const inUse = await this.policies.countListingsUsing(tx, id);
      if (inUse > 0) {
        throw new ConflictException({
          statusCode: 409,
          code: 'CANCELLATION_POLICY_IN_USE',
          message: `Cannot delete a policy still attached to ${inUse} listing(s); reassign them first`,
        });
      }
      await this.policies.delete(tx, id);
    });
  }
}
