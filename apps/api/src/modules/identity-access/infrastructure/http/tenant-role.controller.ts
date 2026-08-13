import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { RoleRef, TenantRoleDetail } from '@booking/contracts';
import { TenantContextService } from '../../../../shared/tenant-context/tenant-context.service';
import type { SessionPrincipal } from '../../domain/ports/session-store.port';
import { CurrentPrincipal } from './decorators/current-principal.decorator';
import { RequirePermissions } from './decorators/require-permissions.decorator';
import { ListTenantRolesUseCase } from '../../application/use-cases/list-tenant-roles.use-case';
import { ListAssignableTenantRolesUseCase } from '../../application/use-cases/list-assignable-tenant-roles.use-case';
import { CreateTenantRoleUseCase } from '../../application/use-cases/create-tenant-role.use-case';
import { UpdateTenantRoleUseCase } from '../../application/use-cases/update-tenant-role.use-case';
import { DeleteTenantRoleUseCase } from '../../application/use-cases/delete-tenant-role.use-case';
import { CreateTenantRoleDto, UpdateTenantRoleDto } from './dto/tenant-access.dto';

/**
 * Tenant-owned RBAC roles (the dashboard's "Vai trò" tab). System roles
 * (`Tenant Owner`, `Manager`, `Finance`, …) are read-only here — only custom
 * roles can be created, edited or deleted; the use-cases enforce that, not
 * this controller.
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
 * Do not "fix" this by re-adding the guard.
 */
@ApiTags('tenant: roles')
@Controller('tenant/roles')
export class TenantRoleController {
  constructor(
    private readonly listRoles: ListTenantRolesUseCase,
    private readonly listAssignable: ListAssignableTenantRolesUseCase,
    private readonly createRole: CreateTenantRoleUseCase,
    private readonly updateRole: UpdateTenantRoleUseCase,
    private readonly deleteRole: DeleteTenantRoleUseCase,
    private readonly tenantContext: TenantContextService,
  ) {}

  // Deliberately `members.manage`, not `roles.manage`: the invite form needs role
  // NAMES to offer, and @RequirePermissions is AND — one endpoint cannot serve
  // "either permission". Returns {id, name} only.
  @RequirePermissions('tenant.members.manage')
  @Get('assignable')
  assignable(): Promise<RoleRef[]> {
    return this.listAssignable.execute(this.tenantContext.tenantIdOrThrow());
  }

  @RequirePermissions('tenant.roles.manage')
  @Get()
  list(): Promise<TenantRoleDetail[]> {
    return this.listRoles.execute(this.tenantContext.tenantIdOrThrow());
  }

  @RequirePermissions('tenant.roles.manage')
  @Post()
  create(
    @Body() input: CreateTenantRoleDto,
    @CurrentPrincipal() principal: SessionPrincipal,
  ): Promise<{ id: string }> {
    return this.createRole.execute(this.tenantContext.tenantIdOrThrow(), input, {
      userId: principal.userId,
    });
  }

  @RequirePermissions('tenant.roles.manage')
  @Patch(':roleId')
  @HttpCode(204)
  async update(
    @Param('roleId', ParseUUIDPipe) roleId: string,
    @Body() input: UpdateTenantRoleDto,
    @CurrentPrincipal() principal: SessionPrincipal,
  ): Promise<void> {
    await this.updateRole.execute(this.tenantContext.tenantIdOrThrow(), roleId, input, {
      userId: principal.userId,
    });
  }

  @RequirePermissions('tenant.roles.manage')
  @Delete(':roleId')
  @HttpCode(204)
  async remove(
    @Param('roleId', ParseUUIDPipe) roleId: string,
    @CurrentPrincipal() principal: SessionPrincipal,
  ): Promise<void> {
    await this.deleteRole.execute(this.tenantContext.tenantIdOrThrow(), roleId, {
      userId: principal.userId,
    });
  }
}
