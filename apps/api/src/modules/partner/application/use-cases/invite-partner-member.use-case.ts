import { Inject, Injectable } from '@nestjs/common';
import type { InvitePartnerMemberInput } from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import { AUDIT_WRITER, type IAuditWriter } from '../../../../shared/audit/audit-writer.port';
import {
  PERMISSION_RESOLVER,
  type IPermissionResolver,
} from '../../../identity-access/domain/ports/permission-resolver.port';
import {
  TENANT_INVITATION_REPOSITORY,
  type ITenantInvitationRepository,
} from '../../../identity-access/domain/ports/tenant-invitation-repository.port';
import {
  INVITATION_TOKEN,
  type IInvitationToken,
} from '../../../identity-access/domain/ports/invitation-token.port';
import { assertGrantable } from '../../../identity-access/domain/tenant-access-policy';
import { RoleNotFound } from '../../../identity-access/domain/errors/tenant-access-errors';
import {
  PARTNER_STAFF_REPOSITORY,
  type IPartnerStaffRepository,
} from '../../domain/ports/partner-staff-repository.port';

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * The partner-tier equivalent of `InviteTenantMemberUseCase`, writing into
 * the SAME `tenant_invitations` table with `partnerId` set. The clear token
 * is minted up front and carried in the outbox payload for Task 9's mailer —
 * the repository stores only its hash (ADR 0001). The event type stays
 * `tenant.member_invited` (not a partner-specific one): the payload's
 * `partnerId` is what tells the mailer which sentence to render, exactly as
 * the brief specifies.
 */
@Injectable()
export class InvitePartnerMemberUseCase {
  constructor(
    @Inject(TENANT_INVITATION_REPOSITORY)
    private readonly invitations: ITenantInvitationRepository,
    @Inject(PARTNER_STAFF_REPOSITORY) private readonly staff: IPartnerStaffRepository,
    @Inject(PERMISSION_RESOLVER) private readonly resolver: IPermissionResolver,
    @Inject(AUDIT_WRITER) private readonly audit: IAuditWriter,
    @Inject(INVITATION_TOKEN) private readonly tokens: IInvitationToken,
    private readonly outbox: OutboxService,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(
    scope: { tenantId: string; partnerId: string },
    input: InvitePartnerMemberInput,
    ctx: { userId: string },
  ): Promise<void> {
    const callerHolds = await this.resolver.resolve(ctx.userId, scope);
    const { token, tokenHash } = this.tokens.issue();
    const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);

    await this.tenantDb.forTenant(scope.tenantId, async (tx) => {
      // Only roles that exist in this partner, and only permissions the caller holds.
      const roles = await this.staff.filterAssignableRoles(tx, scope.partnerId, input.roleIds);
      if (roles.length !== input.roleIds.length) throw new RoleNotFound();
      assertGrantable(
        roles.flatMap((r) => r.permissions),
        callerHolds,
      );

      const invitationId = await this.invitations.create(tx, {
        tenantId: scope.tenantId,
        partnerId: scope.partnerId,
        email: input.email,
        roleIds: input.roleIds,
        tokenHash,
        invitedByUserId: ctx.userId,
        expiresAt,
      });

      // Outbox, not a direct send: the mail must not escape a rolled-back invite.
      await this.outbox.emit(tx, {
        tenantId: scope.tenantId,
        eventType: 'tenant.member_invited',
        payload: {
          invitationId,
          email: input.email,
          token,
          roleNames: roles.map((r) => r.name),
          partnerId: scope.partnerId,
        },
      });

      await this.audit.write(tx, {
        tenantId: scope.tenantId,
        actorUserId: ctx.userId,
        action: 'partner_member.invited',
        entityType: 'tenant_invitation',
        entityId: invitationId,
        data: { email: input.email, roleIds: input.roleIds, partnerId: scope.partnerId },
      });
    });
  }
}
