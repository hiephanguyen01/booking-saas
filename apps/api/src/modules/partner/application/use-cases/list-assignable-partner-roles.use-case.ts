import { Inject, Injectable } from '@nestjs/common';
import type { PartnerRoleRef } from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  PARTNER_STAFF_REPOSITORY,
  type IPartnerStaffRepository,
} from '../../domain/ports/partner-staff-repository.port';
import { toPartnerRoleRef } from '../partner-staff.mapper';

/**
 * The role list the partner invite/edit-member forms offer to pick from —
 * the partner-tier equivalent of `ListAssignableTenantRolesUseCase`.
 * `IPartnerStaffRepository.listAssignableRoles` already returns the shared
 * system partner roles plus this partner's own, permissions included: unlike
 * the tenant tier (which fetches full permission arrays from a second,
 * `tenant.roles.manage`-gated route), the partner tier has no such route —
 * this is the only place its invite/edit form can learn what a role grants,
 * so `permissions` rides along here rather than coming back empty.
 */
@Injectable()
export class ListAssignablePartnerRolesUseCase {
  constructor(
    @Inject(PARTNER_STAFF_REPOSITORY) private readonly staff: IPartnerStaffRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  execute(tenantId: string, partnerId: string): Promise<PartnerRoleRef[]> {
    return this.tenantDb.forTenant(tenantId, async (tx) => {
      const rows = await this.staff.listAssignableRoles(tx, partnerId);
      return rows.map(toPartnerRoleRef);
    });
  }
}
