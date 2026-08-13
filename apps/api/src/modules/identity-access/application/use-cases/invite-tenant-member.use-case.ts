import { Inject, Injectable } from '@nestjs/common';
import type { InviteTenantMemberInput } from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
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
  TENANT_INVITATION_REPOSITORY,
  type ITenantInvitationRepository,
} from '../../domain/ports/tenant-invitation-repository.port';
import { INVITATION_TOKEN, type IInvitationToken } from '../../domain/ports/invitation-token.port';
import { assertGrantable } from '../../domain/tenant-access-policy';
import { RoleNotFound } from '../../domain/errors/tenant-access-errors';

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Invites someone who may not have an account yet. The clear token is minted
 * up front and carried only in the outbox payload for Task 9's mailer — the
 * repository stores just its hash (ADR 0001), so a rolled-back invite cannot
 * leave a usable token anywhere.
 */
@Injectable()
export class InviteTenantMemberUseCase {
  constructor(
    @Inject(TENANT_INVITATION_REPOSITORY)
    private readonly invitations: ITenantInvitationRepository,
    @Inject(TENANT_ROLE_REPOSITORY) private readonly roles: ITenantRoleRepository,
    @Inject(PERMISSION_RESOLVER) private readonly resolver: IPermissionResolver,
    @Inject(AUDIT_WRITER) private readonly audit: IAuditWriter,
    @Inject(INVITATION_TOKEN) private readonly tokens: IInvitationToken,
    private readonly outbox: OutboxService,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(
    tenantId: string,
    input: InviteTenantMemberInput,
    ctx: { userId: string },
  ): Promise<void> {
    const callerHolds = await this.resolver.resolve(ctx.userId, { tenantId });
    const { token, tokenHash } = this.tokens.issue();
    const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);

    await this.tenantDb.forTenant(tenantId, async (tx) => {
      // Only roles that exist in this tenant, and only permissions the caller holds.
      const roles = await this.roles.filterAssignable(tx, tenantId, input.roleIds);
      if (roles.length !== input.roleIds.length) throw new RoleNotFound();
      assertGrantable(
        roles.flatMap((r) => r.permissions),
        callerHolds,
      );

      const invitationId = await this.invitations.create(tx, {
        tenantId,
        email: input.email,
        roleIds: input.roleIds,
        tokenHash,
        invitedByUserId: ctx.userId,
        expiresAt,
      });

      // Outbox, not a direct send: the mail must not escape a rolled-back invite.
      await this.outbox.emit(tx, {
        tenantId,
        eventType: 'tenant.member_invited',
        payload: {
          invitationId,
          email: input.email,
          token,
          roleNames: roles.map((r) => r.name),
        },
      });

      await this.audit.write(tx, {
        tenantId,
        actorUserId: ctx.userId,
        action: 'member.invited',
        entityType: 'tenant_invitation',
        entityId: invitationId,
        data: { email: input.email, roleIds: input.roleIds },
      });
    });
  }
}
