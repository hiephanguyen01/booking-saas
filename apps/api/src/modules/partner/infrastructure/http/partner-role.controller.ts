import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { PartnerRoleRef } from '@booking/contracts';
import { TenantContextService } from '../../../../shared/tenant-context/tenant-context.service';
import { RequirePermissions } from '../../../identity-access/infrastructure/http/decorators/require-permissions.decorator';
import { ListAssignablePartnerRolesUseCase } from '../../application/use-cases/list-assignable-partner-roles.use-case';

/**
 * `GET /partner/roles/assignable` — the partner-tier mirror of
 * `TenantRoleController.assignable`. Split into its own file/class rather
 * than folded into `PartnerMemberController` (the brief allows either; one
 * class per file is the project convention `TenantRoleController` /
 * `TenantMemberController` already follow, and a `@Controller` prefix is
 * per-class, so `partner/roles` cannot share a class with `partner/members`).
 *
 * Deliberately guarded by `partner.members.manage`, not a `roles.manage` key
 * that doesn't exist yet: the invite/edit-member form needs role NAMES to
 * offer, and `@RequirePermissions` is AND, so one route cannot serve "either
 * permission". Returns `{id, name, permissions}` — the shared system partner
 * roles plus this partner's own — with permissions included because, unlike
 * the tenant tier, no custom partner-role CRUD/detail route exists yet for
 * the invite/edit-member form's permission preview to fall back on.
 */
@ApiTags('partner: roles')
@Controller('partner/roles')
export class PartnerRoleController {
  constructor(
    private readonly listAssignable: ListAssignablePartnerRolesUseCase,
    private readonly tenantContext: TenantContextService,
  ) {}

  @RequirePermissions('partner.members.manage')
  @Get('assignable')
  assignable(): Promise<PartnerRoleRef[]> {
    return this.listAssignable.execute(
      this.tenantContext.tenantIdOrThrow(),
      this.tenantContext.partnerIdOrThrow(),
    );
  }
}
