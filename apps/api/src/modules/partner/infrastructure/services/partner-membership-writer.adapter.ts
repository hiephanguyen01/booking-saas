import { Inject, Injectable } from '@nestjs/common';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import type { IPartnerMembershipWriter } from '../../../identity-access/domain/ports/partner-membership-writer.port';
import {
  PARTNER_STAFF_REPOSITORY,
  type IPartnerStaffRepository,
} from '../../domain/ports/partner-staff-repository.port';

/**
 * Implements identity-access's `IPartnerMembershipWriter` port by delegating
 * to this module's own staff repository, so the shared accept-invitation flow
 * (Task 4) can materialise a PARTNER membership without identity-access ever
 * touching `partner_members`. Thin on purpose: `addStaff` already carries the
 * lockstep invariant (partner_members + role_assignments together) — this
 * class exists only to satisfy the port identity-access depends on.
 */
@Injectable()
export class PartnerMembershipWriterAdapter implements IPartnerMembershipWriter {
  constructor(
    @Inject(PARTNER_STAFF_REPOSITORY) private readonly staff: IPartnerStaffRepository,
  ) {}

  materialize(
    tx: PrismaTx,
    params: { tenantId: string; partnerId: string; userId: string; roleIds: readonly string[] },
  ): Promise<string[]> {
    return this.staff.addStaff(tx, params);
  }
}
