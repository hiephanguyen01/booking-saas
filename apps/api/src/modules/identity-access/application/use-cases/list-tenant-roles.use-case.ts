import { Inject, Injectable } from '@nestjs/common';
import type { TenantRoleDetail } from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  TENANT_ROLE_REPOSITORY,
  type ITenantRoleRepository,
} from '../../domain/ports/tenant-role-repository.port';
import { toTenantRoleDetail } from '../tenant-access.mapper';

/** System roles (shared across tenants) + this tenant's own custom roles, with full permission lists. */
@Injectable()
export class ListTenantRolesUseCase {
  constructor(
    @Inject(TENANT_ROLE_REPOSITORY) private readonly roles: ITenantRoleRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  execute(tenantId: string): Promise<TenantRoleDetail[]> {
    return this.tenantDb.forTenant(tenantId, async (tx) => {
      const rows = await this.roles.list(tx, tenantId);
      return rows.map(toTenantRoleDetail);
    });
  }
}
