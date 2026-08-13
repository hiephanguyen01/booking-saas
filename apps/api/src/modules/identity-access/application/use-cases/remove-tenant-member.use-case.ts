import { Inject, Injectable } from '@nestjs/common';
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
import { assertKeepsAManager, assertNotSelf } from '../../domain/tenant-access-policy';

/**
 * Deletes every tenant-scoped role assignment the target user holds. Two of
 * the seven safety invariants apply: no self-edit, and no lockout — checked
 * on the membership with the target filtered OUT, i.e. as it would be once
 * this removal commits.
 *
 * Removal deletes role assignments only. It does NOT revoke the user's
 * `sessions` rows — that is the documented behaviour (see the spec), not an
 * oversight. Within `CACHE_TTL_SECONDS = 60` of the cache invalidation below,
 * the member keeps a signed-in session but loses the tenant workspace
 * entirely, because `listMemberships` no longer returns it.
 */
@Injectable()
export class RemoveTenantMemberUseCase {
  constructor(
    @Inject(TENANT_MEMBER_REPOSITORY) private readonly members: ITenantMemberRepository,
    @Inject(PERMISSION_RESOLVER) private readonly resolver: IPermissionResolver,
    @Inject(AUDIT_WRITER) private readonly audit: IAuditWriter,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(tenantId: string, targetUserId: string, ctx: { userId: string }): Promise<void> {
    assertNotSelf(ctx.userId, targetUserId);

    await this.tenantDb.forTenant(tenantId, async (tx) => {
      const all = await this.members.list(tx, tenantId);
      assertKeepsAManager(all.filter((m) => m.userId !== targetUserId));

      await this.members.removeAll(tx, tenantId, targetUserId);

      await this.audit.write(tx, {
        tenantId,
        actorUserId: ctx.userId,
        action: 'member.removed',
        entityType: 'user',
        entityId: targetUserId,
      });
    });

    // AFTER the tx commits — see set-tenant-member-roles.use-case.ts for why.
    await this.resolver.invalidate(targetUserId);
  }
}
