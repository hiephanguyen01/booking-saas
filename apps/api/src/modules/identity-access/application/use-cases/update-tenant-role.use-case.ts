import { Inject, Injectable } from '@nestjs/common';
import type { UpdateTenantRoleInput } from '@booking/contracts';
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
import {
  TENANT_MEMBER_REPOSITORY,
  type ITenantMemberRepository,
} from '../../domain/ports/tenant-member-repository.port';
import { assertGrantable, assertKeepsAManager } from '../../domain/tenant-access-policy';
import { RoleNotFound, SystemRoleImmutable } from '../../domain/errors/tenant-access-errors';

/**
 * Replaces a custom role's name + whole permission set. Same escalation bound
 * as create — the caller cannot use an edit to hand a role permissions they do
 * not themselves hold, since an edit here is otherwise indistinguishable from
 * minting a new, stronger role under an existing name.
 *
 * Also carries the lockout guard: a role edit changes what every holder of
 * that role may do, so stripping `tenant.members.manage` from a role here
 * strands the tenant exactly as effectively as removing a member does. There
 * is deliberately no `assertNotSelf` — editing a role you hold yourself is a
 * normal thing an owner does; the lockout check (on the post-edit membership
 * projection) is the correct guard, not a self-edit ban.
 */
@Injectable()
export class UpdateTenantRoleUseCase {
  constructor(
    @Inject(TENANT_ROLE_REPOSITORY) private readonly roles: ITenantRoleRepository,
    @Inject(TENANT_MEMBER_REPOSITORY) private readonly members: ITenantMemberRepository,
    @Inject(PERMISSION_RESOLVER) private readonly resolver: IPermissionResolver,
    @Inject(AUDIT_WRITER) private readonly audit: IAuditWriter,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(
    tenantId: string,
    roleId: string,
    input: UpdateTenantRoleInput,
    ctx: { userId: string },
  ): Promise<void> {
    const callerHolds = await this.resolver.resolve(ctx.userId, { tenantId });
    assertGrantable(input.permissions, callerHolds);

    const holders = await this.tenantDb.forTenant(tenantId, async (tx) => {
      const role = await this.roles.findById(tx, tenantId, roleId);
      if (!role) throw new RoleNotFound();
      if (role.isSystem) throw new SystemRoleImmutable();

      // A role edit changes what its holders may do, so it can strand a tenant just as
      // a member removal can — and unlike removal there is no assertNotSelf here, because
      // editing a role you hold is legitimate. Recompute every member's effective set with
      // THIS role's new permissions substituted in, then assert someone can still manage members.
      const allRoles = await this.roles.list(tx, tenantId);
      const permsByRole = new Map(
        allRoles.map((r) => [r.id, r.id === roleId ? input.permissions : r.permissions]),
      );
      const members = await this.members.list(tx, tenantId);
      assertKeepsAManager(
        members.map((m) => ({
          userId: m.userId,
          permissions: [...new Set(m.roles.flatMap((r) => permsByRole.get(r.id) ?? []))],
        })),
      );

      // `role_permissions` has no tenant_id column / RLS policy of its own (Task
      // 4) — the tenant-scoped match inside `update()` is the only thing gating
      // the write, so its boolean result is trusted over the `findById` read
      // above, which could already be stale (role deleted concurrently).
      const updated = await this.roles.update(tx, tenantId, roleId, input.name, input.permissions);
      if (!updated) throw new RoleNotFound();

      await this.audit.write(tx, {
        tenantId,
        actorUserId: ctx.userId,
        action: 'role.updated',
        entityType: 'role',
        entityId: roleId,
        data: { name: input.name, permissions: input.permissions },
      });

      // A role edit changes what its holders may do. Collected inside the tx so
      // the list matches exactly what committed; invalidated only after the tx
      // returns (below) so a concurrent request cannot refill the cache with
      // the permission set this write just replaced.
      return this.members.holdersOfRole(tx, tenantId, roleId);
    });

    await Promise.all(holders.map((userId) => this.resolver.invalidate(userId)));
  }
}
