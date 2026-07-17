import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  TENANT_REPOSITORY,
  type ITenantRepository,
  type TenantRecord,
} from '../../domain/ports/tenant-repository.port';

/**
 * The tenant picks the platform-wide fallback cancellation policy (§11.3), applied
 * when neither a listing nor its partner sets one. The target must be a tenant-level
 * (shared) policy of this tenant; `null` clears it.
 */
@Injectable()
export class SetTenantDefaultCancellationPolicyUseCase {
  constructor(@Inject(TENANT_REPOSITORY) private readonly tenants: ITenantRepository) {}

  async execute(tenantId: string, policyId: string | null): Promise<TenantRecord> {
    if (!(await this.tenants.findById(tenantId))) {
      throw new NotFoundException({
        statusCode: 404,
        code: 'TENANT_NOT_FOUND',
        message: `Tenant ${tenantId} not found`,
      });
    }
    if (policyId !== null && !(await this.tenants.isTenantLevelPolicy(tenantId, policyId))) {
      throw new BadRequestException({
        statusCode: 400,
        code: 'INVALID_CANCELLATION_POLICY',
        message: 'Default must be a tenant-level cancellation policy of this tenant',
      });
    }
    return this.tenants.update(tenantId, { defaultCancellationPolicyId: policyId });
  }
}
