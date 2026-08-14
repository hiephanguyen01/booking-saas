import { Inject, Injectable } from '@nestjs/common';
import type { RoleRef } from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  PARTNER_STAFF_REPOSITORY,
  type IPartnerStaffRepository,
} from '../../domain/ports/partner-staff-repository.port';
import { toPartnerRoleRef } from '../partner-staff.mapper';

/**
 * The `{id, name}` list the partner invite/edit-member forms offer to pick
 * from — the partner-tier equivalent of `ListAssignableTenantRolesUseCase`.
 * `IPartnerStaffRepository.listAssignableRoles` already returns the shared
 * system partner roles plus this partner's own; no permission arrays here.
 */
@Injectable()
export class ListAssignablePartnerRolesUseCase {
  constructor(
    @Inject(PARTNER_STAFF_REPOSITORY) private readonly staff: IPartnerStaffRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  execute(tenantId: string, partnerId: string): Promise<RoleRef[]> {
    return this.tenantDb.forTenant(tenantId, async (tx) => {
      const rows = await this.staff.listAssignableRoles(tx, partnerId);
      return rows.map(toPartnerRoleRef);
    });
  }
}
