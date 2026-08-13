import { Inject, Injectable } from '@nestjs/common';
import type { TenantInvitationPreview } from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  TENANT_INVITATION_REPOSITORY,
  type ITenantInvitationRepository,
} from '../../domain/ports/tenant-invitation-repository.port';
import {
  TENANT_ROLE_REPOSITORY,
  type ITenantRoleRepository,
} from '../../domain/ports/tenant-role-repository.port';
import { INVITATION_TOKEN, type IInvitationToken } from '../../domain/ports/invitation-token.port';
import { InvitationNotFound } from '../../domain/errors/tenant-access-errors';
import { toTenantInvitationPreview } from '../tenant-access.mapper';

/**
 * The recipient's read-only look at an invitation before deciding to accept.
 * Unlike AcceptTenantInvitationUseCase, an email mismatch is NOT an error
 * here — it is reported via `matchesCurrentUser: false` so the acceptance
 * screen can explain "this invite was sent to a different address" instead
 * of failing to load at all.
 *
 * `row.tenantId` (never the `x-tenant-id` header — the caller has no
 * membership yet, so PermissionsGuard never seeds one) is used directly to
 * open the tenant transaction; that is safe because it comes from the
 * invitation row itself, not from client input.
 */
@Injectable()
export class GetInvitationPreviewUseCase {
  constructor(
    @Inject(TENANT_INVITATION_REPOSITORY)
    private readonly invitations: ITenantInvitationRepository,
    @Inject(TENANT_ROLE_REPOSITORY) private readonly roles: ITenantRoleRepository,
    @Inject(INVITATION_TOKEN) private readonly tokens: IInvitationToken,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(
    token: string,
    ctx: { userId: string; email: string },
  ): Promise<TenantInvitationPreview> {
    const row = await this.invitations.findByTokenHash(this.tokens.hash(token));
    if (!row) throw new InvitationNotFound();

    // Same drop-silently behaviour as the tenant-facing invitation list: a
    // role deleted since the invite was sent just disappears from the preview.
    const roles = await this.tenantDb.forTenant(row.tenantId, (tx) =>
      this.roles.filterAssignable(tx, row.tenantId, row.roleIds),
    );

    // citext in the DB, but this comparison is in JS — normalise both sides.
    const matchesCurrentUser = row.email.toLowerCase() === ctx.email.toLowerCase();

    return toTenantInvitationPreview(row, roles, matchesCurrentUser, new Date());
  }
}
