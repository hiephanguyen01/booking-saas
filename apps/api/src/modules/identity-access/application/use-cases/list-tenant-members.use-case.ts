import { Inject, Injectable } from '@nestjs/common';
import type { TenantMember } from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  TENANT_MEMBER_REPOSITORY,
  type ITenantMemberRepository,
} from '../../domain/ports/tenant-member-repository.port';
import { toTenantMember } from '../tenant-access.mapper';

/**
 * Every user holding a tenant-scoped role assignment (`partner_id IS NULL`),
 * with roles and effective permissions unioned across all of their roles.
 */
@Injectable()
export class ListTenantMembersUseCase {
  constructor(
    @Inject(TENANT_MEMBER_REPOSITORY) private readonly members: ITenantMemberRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  execute(tenantId: string): Promise<TenantMember[]> {
    return this.tenantDb.forTenant(tenantId, async (tx) => {
      const rows = await this.members.list(tx, tenantId);
      return rows.map(toTenantMember);
    });
  }
}
