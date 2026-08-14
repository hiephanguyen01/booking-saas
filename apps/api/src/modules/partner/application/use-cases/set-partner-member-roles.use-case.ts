import { Inject, Injectable } from '@nestjs/common';
import type { SetPartnerMemberRolesInput } from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { AUDIT_WRITER, type IAuditWriter } from '../../../../shared/audit/audit-writer.port';
import {
  PERMISSION_RESOLVER,
  type IPermissionResolver,
} from '../../../identity-access/domain/ports/permission-resolver.port';
import {
  assertGrantable,
  assertKeepsAManager,
  assertNotSelf,
  PARTNER_MEMBER_MANAGE_KEY,
} from '../../../identity-access/domain/tenant-access-policy';
import { MemberNotFound, RoleNotFound } from '../../../identity-access/domain/errors/tenant-access-errors';
import {
  PARTNER_STAFF_REPOSITORY,
  type IPartnerStaffRepository,
} from '../../domain/ports/partner-staff-repository.port';

/**
 * Replaces a partner member's whole role set — the partner-tier equivalent of
 * `SetTenantMemberRolesUseCase`, carrying the same three invariants: no
 * self-edit, no escalation beyond the caller's own effective permissions, and
 * no lockout (checked on the membership AS IT WOULD BE after this write,
 * against `PARTNER_MEMBER_MANAGE_KEY` rather than the tenant key). Unlike the
 * tenant version, the write itself is a single `setRoles` replace rather than
 * an add/remove diff — `IPartnerStaffRepository.setRoles` already deletes and
 * recreates the assignment set in one call, and membership (`partner_members`)
 * is untouched either way.
 */
@Injectable()
export class SetPartnerMemberRolesUseCase {
  constructor(
    @Inject(PARTNER_STAFF_REPOSITORY) private readonly staff: IPartnerStaffRepository,
    @Inject(PERMISSION_RESOLVER) private readonly resolver: IPermissionResolver,
    @Inject(AUDIT_WRITER) private readonly audit: IAuditWriter,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(
    scope: { tenantId: string; partnerId: string },
    targetUserId: string,
    input: SetPartnerMemberRolesInput,
    ctx: { userId: string },
  ): Promise<void> {
    assertNotSelf(ctx.userId, targetUserId);
    const callerHolds = await this.resolver.resolve(ctx.userId, scope);

    await this.tenantDb.forTenant(scope.tenantId, async (tx) => {
      const member = await this.staff.findOne(tx, scope.tenantId, scope.partnerId, targetUserId);
      if (!member) throw new MemberNotFound();

      // Only roles that exist in this partner, and only permissions the caller holds.
      const roles = await this.staff.filterAssignableRoles(tx, scope.partnerId, input.roleIds);
      if (roles.length !== input.roleIds.length) throw new RoleNotFound();
      assertGrantable(
        roles.flatMap((r) => r.permissions),
        callerHolds,
      );

      // Lockout check on the membership AS IT WOULD BE.
      const nextPermissions = [...new Set(roles.flatMap((r) => r.permissions))];
      const all = await this.staff.list(tx, scope.tenantId, scope.partnerId);
      assertKeepsAManager(
        all.map((m) =>
          m.userId === targetUserId ? { userId: m.userId, permissions: nextPermissions } : m,
        ),
        PARTNER_MEMBER_MANAGE_KEY,
      );

      await this.staff.setRoles(tx, { ...scope, userId: targetUserId, roleIds: input.roleIds });

      await this.audit.write(tx, {
        tenantId: scope.tenantId,
        actorUserId: ctx.userId,
        action: 'partner_member.roles_changed',
        entityType: 'user',
        entityId: targetUserId,
        data: { partnerId: scope.partnerId, roleIds: input.roleIds },
      });
    });

    // AFTER the tx commits — see set-tenant-member-roles.use-case.ts for why:
    // invalidating mid-transaction could race a concurrent read against a
    // not-yet-committed role assignment.
    await this.resolver.invalidate(targetUserId);
  }
}
