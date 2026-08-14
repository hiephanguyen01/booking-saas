import { Inject, Injectable } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { AUDIT_WRITER, type IAuditWriter } from '../../../../shared/audit/audit-writer.port';
import {
  TENANT_INVITATION_REPOSITORY,
  type ITenantInvitationRepository,
} from '../../domain/ports/tenant-invitation-repository.port';
import { InvitationNotFound, InvitationNotPending } from '../../domain/errors/tenant-access-errors';

/**
 * Cancels a pending TENANT-scope invitation. `revoke()` is a CAS on
 * `status = 'pending'`; a `false` return means it was already accepted or
 * revoked (an expired-but-still-`pending` row still revokes cleanly — that
 * is fine, it just tidies up the list).
 *
 * `tenant_invitations` is one shared table across both tiers (Task 2) — an
 * invitation id alone proves nothing about who may act on it. The ownership
 * check below runs BEFORE the revoke, mirroring
 * `RevokePartnerInvitationUseCase`: a tenant operator cannot revoke a
 * partner-scope invitation by guessing an id, and the failure is the same
 * not-found the partner side throws for a mismatched scope, rather than
 * something that would leak the row's existence.
 */
@Injectable()
export class RevokeTenantInvitationUseCase {
  constructor(
    @Inject(TENANT_INVITATION_REPOSITORY)
    private readonly invitations: ITenantInvitationRepository,
    @Inject(AUDIT_WRITER) private readonly audit: IAuditWriter,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(tenantId: string, invitationId: string, ctx: { userId: string }): Promise<void> {
    await this.tenantDb.forTenant(tenantId, async (tx) => {
      const rows = await this.invitations.list(tx, tenantId);
      const row = rows.find((r) => r.id === invitationId);
      // Scope check BEFORE the revoke: `invitations` is one shared table across
      // both tiers, so an id alone proves nothing about who may act on it.
      if (!row || row.partnerId !== null) throw new InvitationNotFound();

      const revoked = await this.invitations.revoke(tx, tenantId, invitationId);
      if (!revoked) throw new InvitationNotPending();

      await this.audit.write(tx, {
        tenantId,
        actorUserId: ctx.userId,
        action: 'invitation.revoked',
        entityType: 'tenant_invitation',
        entityId: invitationId,
      });
    });
  }
}
