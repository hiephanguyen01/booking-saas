import { Inject, Injectable } from '@nestjs/common';
import type { SetTenantMemberRolesInput } from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { AUDIT_WRITER, type IAuditWriter } from '../../../../shared/audit/audit-writer.port';
import {
  PERMISSION_RESOLVER,
  type IPermissionResolver,
} from '../../domain/ports/permission-resolver.port';
import {
  TENANT_MEMBER_REPOSITORY,
  type ITenantMemberRepository,
} from '../../domain/ports/tenant-member-repository.port';
import {
  TENANT_ROLE_REPOSITORY,
  type ITenantRoleRepository,
} from '../../domain/ports/tenant-role-repository.port';
import {
  assertGrantable,
  assertKeepsAManager,
  assertNotSelf,
  diffRoleIds,
} from '../../domain/tenant-access-policy';
import { MemberNotFound, RoleNotFound } from '../../domain/errors/tenant-access-errors';

/**
 * Replaces a member's whole role set. Carries three of the seven safety
 * invariants (Task 3 policy): no self-edit, no escalation beyond the caller's
 * own effective permissions, and no lockout — the lockout check runs on the
 * membership AS IT WOULD BE after this write, not the membership before it,
 * so it must see the target member's NEW permission union, not their old one.
 */
@Injectable()
export class SetTenantMemberRolesUseCase {
  constructor(
    @Inject(TENANT_MEMBER_REPOSITORY) private readonly members: ITenantMemberRepository,
    @Inject(TENANT_ROLE_REPOSITORY) private readonly roles: ITenantRoleRepository,
    @Inject(PERMISSION_RESOLVER) private readonly resolver: IPermissionResolver,
    @Inject(AUDIT_WRITER) private readonly audit: IAuditWriter,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(
    tenantId: string,
    targetUserId: string,
    input: SetTenantMemberRolesInput,
    ctx: { userId: string },
  ): Promise<void> {
    assertNotSelf(ctx.userId, targetUserId);
    const callerHolds = await this.resolver.resolve(ctx.userId, { tenantId });

    await this.tenantDb.forTenant(tenantId, async (tx) => {
      const member = await this.members.findOne(tx, tenantId, targetUserId);
      if (!member) throw new MemberNotFound();

      // Only roles that exist in this tenant, and only permissions the caller holds.
      const roles = await this.roles.filterAssignable(tx, tenantId, input.roleIds);
      if (roles.length !== input.roleIds.length) throw new RoleNotFound();
      assertGrantable(
        roles.flatMap((r) => r.permissions),
        callerHolds,
      );

      // Lockout check on the membership AS IT WOULD BE.
      const nextPermissions = [...new Set(roles.flatMap((r) => r.permissions))];
      const all = await this.members.list(tx, tenantId);
      assertKeepsAManager(
        all.map((m) =>
          m.userId === targetUserId ? { userId: m.userId, permissions: nextPermissions } : m,
        ),
      );

      const { add, remove } = diffRoleIds(
        member.roles.map((r) => r.id),
        input.roleIds,
      );
      if (remove.length) await this.members.removeRoles(tx, tenantId, targetUserId, remove);
      if (add.length) await this.members.addRoles(tx, tenantId, targetUserId, add);

      await this.audit.write(tx, {
        tenantId,
        actorUserId: ctx.userId,
        action: 'member.roles_changed',
        entityType: 'user',
        entityId: targetUserId,
        data: { added: add, removed: remove },
      });
    });

    // AFTER the tx commits. Skipping this leaves the member acting on the old
    // permission set for up to 60s (permission-resolver.service.ts:11) — silently.
    await this.resolver.invalidate(targetUserId);
  }
}
