import { Inject, Injectable } from '@nestjs/common';
import type { TenantInvitation } from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  TENANT_INVITATION_REPOSITORY,
  type ITenantInvitationRepository,
} from '../../../identity-access/domain/ports/tenant-invitation-repository.port';
import {
  PARTNER_STAFF_REPOSITORY,
  type IPartnerStaffRepository,
} from '../../domain/ports/partner-staff-repository.port';
import { toPartnerInvitation } from '../partner-staff.mapper';

/**
 * `tenant_invitations` is one shared table across both tiers (Task 2) — this
 * partner's invitations are exactly the rows whose `partnerId` matches the
 * caller's scope, filtered client-side from the tenant's full list rather
 * than a separate query, since the repository has no partner-scoped `list`.
 * Role names come from `listAssignableRoles`, matching
 * `ListTenantInvitationsUseCase`'s pattern of resolving names once rather
 * than per invitation.
 */
@Injectable()
export class ListPartnerInvitationsUseCase {
  constructor(
    @Inject(TENANT_INVITATION_REPOSITORY)
    private readonly invitations: ITenantInvitationRepository,
    @Inject(PARTNER_STAFF_REPOSITORY) private readonly staff: IPartnerStaffRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  execute(tenantId: string, partnerId: string): Promise<TenantInvitation[]> {
    return this.tenantDb.forTenant(tenantId, async (tx) => {
      const [rows, roleRows] = await Promise.all([
        this.invitations.list(tx, tenantId),
        this.staff.listAssignableRoles(tx, partnerId),
      ]);
      const roleNames = new Map(roleRows.map((r) => [r.id, r.name]));
      const now = new Date();
      return rows
        .filter((r) => r.partnerId === partnerId)
        .map((row) => toPartnerInvitation(row, roleNames, now));
    });
  }
}
