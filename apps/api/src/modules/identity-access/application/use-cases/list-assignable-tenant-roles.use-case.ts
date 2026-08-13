import { Inject, Injectable } from '@nestjs/common';
import type { RoleRef } from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  TENANT_ROLE_REPOSITORY,
  type ITenantRoleRepository,
} from '../../domain/ports/tenant-role-repository.port';
import { toRoleRef } from '../tenant-access.mapper';

/**
 * The `{id, name}` list the member-invite and member-edit forms offer to pick
 * from — everything `list()` would return, trimmed to what a role picker needs.
 * Deliberately lighter than `ListTenantRolesUseCase`: no permission arrays.
 */
@Injectable()
export class ListAssignableTenantRolesUseCase {
  constructor(
    @Inject(TENANT_ROLE_REPOSITORY) private readonly roles: ITenantRoleRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  execute(tenantId: string): Promise<RoleRef[]> {
    return this.tenantDb.forTenant(tenantId, async (tx) => {
      const rows = await this.roles.list(tx, tenantId);
      return rows.map(toRoleRef);
    });
  }
}
