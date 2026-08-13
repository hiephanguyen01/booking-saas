import { Inject, Injectable } from '@nestjs/common';
import type { TenantInvitation } from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  TENANT_INVITATION_REPOSITORY,
  type ITenantInvitationRepository,
} from '../../domain/ports/tenant-invitation-repository.port';
import {
  TENANT_ROLE_REPOSITORY,
  type ITenantRoleRepository,
} from '../../domain/ports/tenant-role-repository.port';
import { toTenantInvitation } from '../tenant-access.mapper';

/**
 * Every invitation the tenant has ever sent (pending/accepted/revoked rows,
 * plus pending-but-past-`expiresAt` reported as `expired` by the mapper — that
 * state is derived here, never stored).
 */
@Injectable()
export class ListTenantInvitationsUseCase {
  constructor(
    @Inject(TENANT_INVITATION_REPOSITORY)
    private readonly invitations: ITenantInvitationRepository,
    @Inject(TENANT_ROLE_REPOSITORY) private readonly roles: ITenantRoleRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  execute(tenantId: string): Promise<TenantInvitation[]> {
    return this.tenantDb.forTenant(tenantId, async (tx) => {
      const [rows, roleRows] = await Promise.all([
        this.invitations.list(tx, tenantId),
        this.roles.list(tx, tenantId),
      ]);
      const roleNames = new Map(roleRows.map((r) => [r.id, r.name]));
      const now = new Date();
      return rows.map((row) => toTenantInvitation(row, roleNames, now));
    });
  }
}
