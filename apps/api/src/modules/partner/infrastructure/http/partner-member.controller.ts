import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { PartnerMember, TenantInvitation } from '@booking/contracts';
import { TenantContextService } from '../../../../shared/tenant-context/tenant-context.service';
import type { SessionPrincipal } from '../../../identity-access/domain/ports/session-store.port';
import { CurrentPrincipal } from '../../../identity-access/infrastructure/http/decorators/current-principal.decorator';
import { RequirePermissions } from '../../../identity-access/infrastructure/http/decorators/require-permissions.decorator';
import { ListPartnerMembersUseCase } from '../../application/use-cases/list-partner-members.use-case';
import { SetPartnerMemberRolesUseCase } from '../../application/use-cases/set-partner-member-roles.use-case';
import { RemovePartnerMemberUseCase } from '../../application/use-cases/remove-partner-member.use-case';
import { InvitePartnerMemberUseCase } from '../../application/use-cases/invite-partner-member.use-case';
import { ListPartnerInvitationsUseCase } from '../../application/use-cases/list-partner-invitations.use-case';
import { RevokePartnerInvitationUseCase } from '../../application/use-cases/revoke-partner-invitation.use-case';
import { InvitePartnerMemberDto, SetPartnerMemberRolesDto } from './dto/partner-staff.dto';

/**
 * Partner-owned staff (the dashboard's partner "Nhân sự" tab) — the
 * partner-tier mirror of `TenantMemberController`: list members, replace a
 * member's role set, remove a member; invite someone who may not have an
 * account yet, list outstanding invitations, revoke one.
 *
 * The `/invitations` routes are declared before the `:userId` routes below:
 * with an Express-style router, a `:userId` route registered first would
 * capture the literal `invitations` segment as a userId and 404 every
 * invitation call against a member lookup.
 *
 * Scope (`tenantId` + `partnerId`) comes from `TenantContextService`, not
 * from a route param — `PermissionsGuard` has already verified, via the
 * `x-tenant-id`/`x-partner-id` headers, that the caller holds a role
 * assignment in the partner named there, and seeded both ids before this
 * controller runs.
 *
 * Unlike every other tenant-settings mutation, these write routes carry no
 * `@UseGuards(RequireActiveSubscriptionGuard)`. Two independent reasons —
 * same as `tenant-role.controller.ts` and `tenant-member.controller.ts`:
 *
 *  - Product decision: staff and role management deliberately stay available
 *    when a subscription lapses. When someone leaves, the partner owner must
 *    be able to revoke their access immediately — that need is MORE urgent
 *    while billing is broken, not less. Gating it behind an active
 *    subscription would strand a partner with a departed staff member still
 *    holding live permissions.
 *  - Even setting that aside, the guard lives in `tenancy`, and every
 *    tenancy controller already imports identity-access's
 *    `RequirePermissions`/`Public` decorators — so identity-access importing
 *    anything back from `modules/tenancy/*` would close
 *    `identity-access → tenancy → identity-access`, which
 *    `pnpm check:module-cycles` (ADR 0003, CI-enforced) rejects.
 *
 * Do not "fix" this by re-adding the guard.
 */
@ApiTags('partner: members')
@Controller('partner/members')
export class PartnerMemberController {
  constructor(
    private readonly listMembers: ListPartnerMembersUseCase,
    private readonly setRoles: SetPartnerMemberRolesUseCase,
    private readonly removeMember: RemovePartnerMemberUseCase,
    private readonly inviteMember: InvitePartnerMemberUseCase,
    private readonly listInvitations: ListPartnerInvitationsUseCase,
    private readonly revokeInvitation: RevokePartnerInvitationUseCase,
    private readonly tenantContext: TenantContextService,
  ) {}

  private scope(): { tenantId: string; partnerId: string } {
    return {
      tenantId: this.tenantContext.tenantIdOrThrow(),
      partnerId: this.tenantContext.partnerIdOrThrow(),
    };
  }

  @RequirePermissions('partner.members.manage')
  @Get()
  list(): Promise<PartnerMember[]> {
    const { tenantId, partnerId } = this.scope();
    return this.listMembers.execute(tenantId, partnerId);
  }

  // ── Invitations — declared ahead of the `:userId` routes below. ────────────

  @RequirePermissions('partner.members.manage')
  @Get('invitations')
  listPendingInvitations(): Promise<TenantInvitation[]> {
    const { tenantId, partnerId } = this.scope();
    return this.listInvitations.execute(tenantId, partnerId);
  }

  @RequirePermissions('partner.members.manage')
  @Post('invitations')
  @HttpCode(204)
  async invite(
    @Body() input: InvitePartnerMemberDto,
    @CurrentPrincipal() principal: SessionPrincipal,
  ): Promise<void> {
    await this.inviteMember.execute(this.scope(), input, { userId: principal.userId });
  }

  @RequirePermissions('partner.members.manage')
  @Delete('invitations/:id')
  @HttpCode(204)
  async revoke(
    @Param('id', ParseUUIDPipe) invitationId: string,
    @CurrentPrincipal() principal: SessionPrincipal,
  ): Promise<void> {
    await this.revokeInvitation.execute(this.scope(), invitationId, { userId: principal.userId });
  }

  @RequirePermissions('partner.members.manage')
  @Put(':userId/roles')
  @HttpCode(204)
  async setMemberRoles(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() input: SetPartnerMemberRolesDto,
    @CurrentPrincipal() principal: SessionPrincipal,
  ): Promise<void> {
    await this.setRoles.execute(this.scope(), userId, input, { userId: principal.userId });
  }

  @RequirePermissions('partner.members.manage')
  @Delete(':userId')
  @HttpCode(204)
  async remove(
    @Param('userId', ParseUUIDPipe) userId: string,
    @CurrentPrincipal() principal: SessionPrincipal,
  ): Promise<void> {
    await this.removeMember.execute(this.scope(), userId, { userId: principal.userId });
  }
}
