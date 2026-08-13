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
import type { TenantInvitation, TenantMember } from '@booking/contracts';
import { TenantContextService } from '../../../../shared/tenant-context/tenant-context.service';
import type { SessionPrincipal } from '../../domain/ports/session-store.port';
import { CurrentPrincipal } from './decorators/current-principal.decorator';
import { RequirePermissions } from './decorators/require-permissions.decorator';
import { ListTenantMembersUseCase } from '../../application/use-cases/list-tenant-members.use-case';
import { SetTenantMemberRolesUseCase } from '../../application/use-cases/set-tenant-member-roles.use-case';
import { RemoveTenantMemberUseCase } from '../../application/use-cases/remove-tenant-member.use-case';
import { InviteTenantMemberUseCase } from '../../application/use-cases/invite-tenant-member.use-case';
import { ListTenantInvitationsUseCase } from '../../application/use-cases/list-tenant-invitations.use-case';
import { RevokeTenantInvitationUseCase } from '../../application/use-cases/revoke-tenant-invitation.use-case';
import { InviteTenantMemberDto, SetTenantMemberRolesDto } from './dto/tenant-access.dto';

/**
 * Tenant-owned staff (the dashboard's "Nhân sự" tab): list members, replace a
 * member's role set, remove a member; invite someone who may not have an
 * account yet, list outstanding invitations, revoke one.
 *
 * The `/invitations` routes are declared before the `:userId` routes below:
 * with an Express-style router, a `:userId` route registered first would
 * capture the literal `invitations` segment as a userId and 404 every
 * invitation call against a member lookup.
 *
 * Unlike every other tenant-settings mutation, these write routes carry no
 * `@UseGuards(RequireActiveSubscriptionGuard)`. Two independent reasons:
 *
 *  - Product decision: staff and role management deliberately stay available
 *    when a subscription lapses. When an employee leaves, the tenant owner
 *    must be able to revoke their access immediately — that need is MORE
 *    urgent while billing is broken, not less. Gating it behind an active
 *    subscription would strand a tenant with a departed employee still
 *    holding live permissions.
 *  - Even setting that aside, the guard lives in `tenancy`, and every
 *    tenancy controller already imports identity-access's
 *    `RequirePermissions`/`Public` decorators — so identity-access importing
 *    anything back from `modules/tenancy/*` would close
 *    `identity-access → tenancy → identity-access`, which
 *    `pnpm check:module-cycles` (ADR 0003, CI-enforced) rejects.
 *
 * Do not "fix" this by re-adding the guard. See `tenant-role.controller.ts`
 * for the same reasoning applied to roles.
 */
@ApiTags('tenant: members')
@Controller('tenant/members')
export class TenantMemberController {
  constructor(
    private readonly listMembers: ListTenantMembersUseCase,
    private readonly setRoles: SetTenantMemberRolesUseCase,
    private readonly removeMember: RemoveTenantMemberUseCase,
    private readonly inviteMember: InviteTenantMemberUseCase,
    private readonly listInvitations: ListTenantInvitationsUseCase,
    private readonly revokeInvitation: RevokeTenantInvitationUseCase,
    private readonly tenantContext: TenantContextService,
  ) {}

  @RequirePermissions('tenant.members.manage')
  @Get()
  list(): Promise<TenantMember[]> {
    return this.listMembers.execute(this.tenantContext.tenantIdOrThrow());
  }

  // ── Invitations — declared ahead of the `:userId` routes below. ────────────

  @RequirePermissions('tenant.members.manage')
  @Get('invitations')
  listPendingInvitations(): Promise<TenantInvitation[]> {
    return this.listInvitations.execute(this.tenantContext.tenantIdOrThrow());
  }

  @RequirePermissions('tenant.members.manage')
  @Post('invitations')
  @HttpCode(204)
  async invite(
    @Body() input: InviteTenantMemberDto,
    @CurrentPrincipal() principal: SessionPrincipal,
  ): Promise<void> {
    await this.inviteMember.execute(this.tenantContext.tenantIdOrThrow(), input, {
      userId: principal.userId,
    });
  }

  @RequirePermissions('tenant.members.manage')
  @Delete('invitations/:id')
  @HttpCode(204)
  async revoke(
    @Param('id', ParseUUIDPipe) invitationId: string,
    @CurrentPrincipal() principal: SessionPrincipal,
  ): Promise<void> {
    await this.revokeInvitation.execute(this.tenantContext.tenantIdOrThrow(), invitationId, {
      userId: principal.userId,
    });
  }

  @RequirePermissions('tenant.members.manage')
  @Put(':userId/roles')
  @HttpCode(204)
  async setMemberRoles(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() input: SetTenantMemberRolesDto,
    @CurrentPrincipal() principal: SessionPrincipal,
  ): Promise<void> {
    await this.setRoles.execute(this.tenantContext.tenantIdOrThrow(), userId, input, {
      userId: principal.userId,
    });
  }

  @RequirePermissions('tenant.members.manage')
  @Delete(':userId')
  @HttpCode(204)
  async remove(
    @Param('userId', ParseUUIDPipe) userId: string,
    @CurrentPrincipal() principal: SessionPrincipal,
  ): Promise<void> {
    await this.removeMember.execute(this.tenantContext.tenantIdOrThrow(), userId, {
      userId: principal.userId,
    });
  }
}
