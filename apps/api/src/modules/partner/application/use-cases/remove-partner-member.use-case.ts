import { Inject, Injectable } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { AUDIT_WRITER, type IAuditWriter } from '../../../../shared/audit/audit-writer.port';
import {
  PERMISSION_RESOLVER,
  type IPermissionResolver,
} from '../../../identity-access/domain/ports/permission-resolver.port';
import {
  assertKeepsAManager,
  assertNotSelf,
  PARTNER_MEMBER_MANAGE_KEY,
} from '../../../identity-access/domain/tenant-access-policy';
import {
  PARTNER_STAFF_REPOSITORY,
  type IPartnerStaffRepository,
} from '../../domain/ports/partner-staff-repository.port';

/**
 * Removes someone from a partner's staff — the partner-tier equivalent of
 * `RemoveTenantMemberUseCase`: no self-edit, no lockout (checked with the
 * target filtered OUT, i.e. as the membership would be once this commits).
 *
 * Unlike the tenant version, this is the LOCKSTEP removal
 * (`IPartnerStaffRepository.removeStaff`): it deletes the `partner_members`
 * row AND every partner-scope role assignment together, in one repository
 * call, rather than assignments-only. Leaving `partner_members` behind would
 * keep mailing booking notifications to someone who can no longer act on
 * them (Task 3's invariant).
 */
@Injectable()
export class RemovePartnerMemberUseCase {
  constructor(
    @Inject(PARTNER_STAFF_REPOSITORY) private readonly staff: IPartnerStaffRepository,
    @Inject(PERMISSION_RESOLVER) private readonly resolver: IPermissionResolver,
    @Inject(AUDIT_WRITER) private readonly audit: IAuditWriter,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(
    scope: { tenantId: string; partnerId: string },
    targetUserId: string,
    ctx: { userId: string },
  ): Promise<void> {
    assertNotSelf(ctx.userId, targetUserId);

    await this.tenantDb.forTenant(scope.tenantId, async (tx) => {
      const all = await this.staff.list(tx, scope.tenantId, scope.partnerId);
      assertKeepsAManager(
        all.filter((m) => m.userId !== targetUserId),
        PARTNER_MEMBER_MANAGE_KEY,
      );

      await this.staff.removeStaff(tx, scope.tenantId, scope.partnerId, targetUserId);

      await this.audit.write(tx, {
        tenantId: scope.tenantId,
        actorUserId: ctx.userId,
        action: 'partner_member.removed',
        entityType: 'user',
        entityId: targetUserId,
        data: { partnerId: scope.partnerId },
      });
    });

    // AFTER the tx commits — see set-partner-member-roles.use-case.ts for why.
    await this.resolver.invalidate(targetUserId);
  }
}
