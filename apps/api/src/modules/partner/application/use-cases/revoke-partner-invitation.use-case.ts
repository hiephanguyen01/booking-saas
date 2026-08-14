import { Inject, Injectable } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { AUDIT_WRITER, type IAuditWriter } from '../../../../shared/audit/audit-writer.port';
import {
  TENANT_INVITATION_REPOSITORY,
  type ITenantInvitationRepository,
} from '../../../identity-access/domain/ports/tenant-invitation-repository.port';
import {
  InvitationNotFound,
  InvitationNotPending,
} from '../../../identity-access/domain/errors/tenant-access-errors';

/**
 * Cancels a pending PARTNER-scope invitation. `RevokeTenantInvitationUseCase`
 * cannot be reused: it scopes its CAS by `tenantId` only, and `tenant_invitations`
 * is now one shared table across both tiers (Task 2) — an invitation id alone
 * proves nothing about who may act on it. The ownership check below runs BEFORE
 * the revoke, so a partner owner cannot revoke a tenant-scope invitation, or
 * another partner's, by guessing an id.
 */
@Injectable()
export class RevokePartnerInvitationUseCase {
  constructor(
    @Inject(TENANT_INVITATION_REPOSITORY)
    private readonly invitations: ITenantInvitationRepository,
    @Inject(AUDIT_WRITER) private readonly audit: IAuditWriter,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(
    scope: { tenantId: string; partnerId: string },
    invitationId: string,
    ctx: { userId: string },
  ): Promise<void> {
    await this.tenantDb.forTenant(scope.tenantId, async (tx) => {
      const rows = await this.invitations.list(tx, scope.tenantId);
      const row = rows.find((r) => r.id === invitationId);
      // Scope check BEFORE the revoke: `invitations` is one shared table across
      // both tiers, so an id alone proves nothing about who may act on it.
      if (!row || row.partnerId !== scope.partnerId) throw new InvitationNotFound();

      const revoked = await this.invitations.revoke(tx, scope.tenantId, invitationId);
      if (!revoked) throw new InvitationNotPending();

      await this.audit.write(tx, {
        tenantId: scope.tenantId,
        actorUserId: ctx.userId,
        action: 'partner_member.invitation_revoked',
        entityType: 'tenant_invitation',
        entityId: invitationId,
        data: { partnerId: scope.partnerId },
      });
    });
  }
}
