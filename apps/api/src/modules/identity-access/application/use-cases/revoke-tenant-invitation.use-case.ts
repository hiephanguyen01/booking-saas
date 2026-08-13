import { Inject, Injectable } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { AUDIT_WRITER, type IAuditWriter } from '../../../../shared/audit/audit-writer.port';
import {
  TENANT_INVITATION_REPOSITORY,
  type ITenantInvitationRepository,
} from '../../domain/ports/tenant-invitation-repository.port';
import { InvitationNotPending } from '../../domain/errors/tenant-access-errors';

/**
 * Cancels a pending invitation. `revoke()` is a CAS on `status = 'pending'`;
 * a `false` return means it was already accepted or revoked (an expired-but-
 * still-`pending` row still revokes cleanly — that is fine, it just tidies up
 * the list).
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
