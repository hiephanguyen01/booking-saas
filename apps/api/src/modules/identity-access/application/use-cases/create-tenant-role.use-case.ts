import { Inject, Injectable } from '@nestjs/common';
import type { CreateTenantRoleInput } from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { AUDIT_WRITER, type IAuditWriter } from '../../../../shared/audit/audit-writer.port';
import {
  PERMISSION_RESOLVER,
  type IPermissionResolver,
} from '../../domain/ports/permission-resolver.port';
import {
  TENANT_ROLE_REPOSITORY,
  type ITenantRoleRepository,
} from '../../domain/ports/tenant-role-repository.port';
import { assertGrantable } from '../../domain/tenant-access-policy';

/**
 * Creates a tenant-owned role (`tenant_id` set, `is_system = false`) from the
 * tenant permission catalog. The caller's own effective permissions bound what
 * the new role may contain, so a custom-role holder cannot mint a stronger role.
 */
@Injectable()
export class CreateTenantRoleUseCase {
  constructor(
    @Inject(TENANT_ROLE_REPOSITORY) private readonly roles: ITenantRoleRepository,
    @Inject(PERMISSION_RESOLVER) private readonly resolver: IPermissionResolver,
    @Inject(AUDIT_WRITER) private readonly audit: IAuditWriter,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(
    tenantId: string,
    input: CreateTenantRoleInput,
    ctx: { userId: string },
  ): Promise<{ id: string }> {
    const callerHolds = await this.resolver.resolve(ctx.userId, { tenantId });
    assertGrantable(input.permissions, callerHolds);

    return this.tenantDb.forTenant(tenantId, async (tx) => {
      const id = await this.roles.create(tx, tenantId, input.name, input.permissions);
      await this.audit.write(tx, {
        tenantId,
        actorUserId: ctx.userId,
        action: 'role.created',
        entityType: 'role',
        entityId: id,
        data: { name: input.name, permissions: input.permissions },
      });
      return { id };
    });
  }
}
