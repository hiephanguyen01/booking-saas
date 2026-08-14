import { Inject, Injectable } from '@nestjs/common';
import type { RoleRef } from '@booking/contracts';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import type { IPartnerRoleReader } from '../../../identity-access/domain/ports/partner-role-reader.port';
import {
  PARTNER_STAFF_REPOSITORY,
  type IPartnerStaffRepository,
} from '../../domain/ports/partner-staff-repository.port';

/**
 * Implements identity-access's `IPartnerRoleReader` by delegating to this
 * module's own staff repository — the read-side counterpart of
 * `PartnerMembershipWriterAdapter`. Kept as its own class rather than folded
 * into that adapter because it serves an unrelated caller
 * (`GetInvitationPreviewUseCase`, a read) from the write-path one
 * (`AcceptTenantInvitationUseCase`).
 */
@Injectable()
export class PartnerRoleReaderAdapter implements IPartnerRoleReader {
  constructor(
    @Inject(PARTNER_STAFF_REPOSITORY) private readonly staff: IPartnerStaffRepository,
  ) {}

  async filterAssignable(
    tx: PrismaTx,
    partnerId: string,
    roleIds: readonly string[],
  ): Promise<RoleRef[]> {
    const roles = await this.staff.filterAssignableRoles(tx, partnerId, roleIds);
    return roles.map((r) => ({ id: r.id, name: r.name }));
  }
}
