import { Inject, Injectable } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { AUDIT_WRITER, type IAuditWriter } from '../../../../shared/audit/audit-writer.port';
import {
  TENANT_ROLE_REPOSITORY,
  type ITenantRoleRepository,
} from '../../domain/ports/tenant-role-repository.port';
import { RoleInUse, RoleNotFound, SystemRoleImmutable } from '../../domain/errors/tenant-access-errors';

/**
 * Deletes a custom role. `memberCount > 0` is a hard stop, not a warning:
 * `RoleAssignment.role` declares `onDelete: Cascade` (schema.prisma:719), so an
 * unguarded delete would silently strip the role from every holder instead of
 * failing loudly.
 */
@Injectable()
export class DeleteTenantRoleUseCase {
  constructor(
    @Inject(TENANT_ROLE_REPOSITORY) private readonly roles: ITenantRoleRepository,
    @Inject(AUDIT_WRITER) private readonly audit: IAuditWriter,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(tenantId: string, roleId: string, ctx: { userId: string }): Promise<void> {
    await this.tenantDb.forTenant(tenantId, async (tx) => {
      const role = await this.roles.findById(tx, tenantId, roleId);
      if (!role) throw new RoleNotFound();
      if (role.isSystem) throw new SystemRoleImmutable();
      // No assertKeepsAManager needed here: memberCount > 0 already refuses to delete
      // a role anyone holds, so a successful delete cannot change anyone's permissions.
      if (role.memberCount > 0) throw new RoleInUse(role.memberCount);

      await this.roles.delete(tx, tenantId, roleId);

      await this.audit.write(tx, {
        tenantId,
        actorUserId: ctx.userId,
        action: 'role.deleted',
        entityType: 'role',
        entityId: roleId,
        data: { name: role.name },
      });
    });
  }
}
