import { Inject, Injectable } from '@nestjs/common';
import type { PartnerMember } from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  PARTNER_STAFF_REPOSITORY,
  type IPartnerStaffRepository,
} from '../../domain/ports/partner-staff-repository.port';
import { toPartnerMember } from '../partner-staff.mapper';

/**
 * Everyone holding a partner-scope role assignment in this partner (the
 * partner-tier equivalent of `ListTenantMembersUseCase`), roles and effective
 * permissions unioned across all of that user's roles.
 */
@Injectable()
export class ListPartnerMembersUseCase {
  constructor(
    @Inject(PARTNER_STAFF_REPOSITORY) private readonly staff: IPartnerStaffRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  execute(tenantId: string, partnerId: string): Promise<PartnerMember[]> {
    return this.tenantDb.forTenant(tenantId, async (tx) => {
      const rows = await this.staff.list(tx, tenantId, partnerId);
      return rows.map(toPartnerMember);
    });
  }
}
