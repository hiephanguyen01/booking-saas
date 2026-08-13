import { Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { TenantInvitationPreview } from '@booking/contracts';
import type { SessionPrincipal } from '../../domain/ports/session-store.port';
import { AuthenticatedOnly } from './decorators/authenticated-only.decorator';
import { CurrentPrincipal } from './decorators/current-principal.decorator';
import { GetInvitationPreviewUseCase } from '../../application/use-cases/get-invitation-preview.use-case';
import { AcceptTenantInvitationUseCase } from '../../application/use-cases/accept-tenant-invitation.use-case';

/**
 * The recipient's side of an invitation. This is the only pair of routes in
 * the module a caller with NO membership in the tenant may reach, which is
 * why authorization here works differently from every other identity-access
 * route:
 *
 * @AuthenticatedOnly, NOT @RequirePermissions — the recipient has no
 * membership in the tenant yet, so any `tenant.*` requirement would 403
 * exactly the people this route exists for. On the @AuthenticatedOnly path
 * PermissionsGuard returns early: it never reads `x-tenant-id` and never
 * seeds tenant context. The tenant these routes act on comes from the
 * invitation row itself (resolved from the token), never from that header —
 * trusting it here would let any signed-in user name any tenant.
 *
 * Deliberately not on TenantMemberController: that controller's audience is
 * an existing tenant member managing staff; this one's audience is an
 * outsider holding a mailed link.
 */
@ApiTags('me: invitations')
@Controller('auth/invitations')
export class MeInvitationController {
  constructor(
    private readonly preview: GetInvitationPreviewUseCase,
    private readonly acceptInvitation: AcceptTenantInvitationUseCase,
  ) {}

  @AuthenticatedOnly()
  @Get(':token')
  previewRoute(
    @Param('token') token: string,
    @CurrentPrincipal() principal: SessionPrincipal,
  ): Promise<TenantInvitationPreview> {
    return this.preview.execute(token, { userId: principal.userId, email: principal.email });
  }

  @AuthenticatedOnly()
  @Post(':token/accept')
  @HttpCode(204)
  async acceptRoute(
    @Param('token') token: string,
    @CurrentPrincipal() principal: SessionPrincipal,
  ): Promise<void> {
    await this.acceptInvitation.execute(token, {
      userId: principal.userId,
      email: principal.email,
    });
  }
}
