import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  PARTNER_REPOSITORY,
  type IPartnerRepository,
  type PartnerRecord,
} from '../../domain/ports/partner-repository.port';

/**
 * A partner reads its OWN record (§7.3) — status, rejection reason, payout bank
 * account, uploaded documents.
 *
 * `partnerId` comes from the PermissionsGuard-verified scope, never from the
 * body: the guard only accepts a partner the caller holds a role assignment on,
 * so this can only ever return the caller's own partner. A partner-scoped route
 * has no tenant context of its own, so the tenant is resolved from the partner
 * (admin pool) before opening the RLS transaction — the same shape the sibling
 * write use-cases use.
 */
@Injectable()
export class GetPartnerProfileUseCase {
  constructor(
    @Inject(PARTNER_REPOSITORY) private readonly partners: IPartnerRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(partnerId: string): Promise<PartnerRecord> {
    const tenantId = await this.partners.tenantIdOfPartner(partnerId);
    if (!tenantId) {
      throw new NotFoundException({
        statusCode: 404,
        code: 'PARTNER_NOT_FOUND',
        message: 'Partner not found',
      });
    }
    const partner = await this.tenantDb.forTenant(tenantId, (tx) =>
      this.partners.findById(tx, partnerId),
    );
    if (!partner) {
      throw new NotFoundException({
        statusCode: 404,
        code: 'PARTNER_NOT_FOUND',
        message: 'Partner not found',
      });
    }
    return partner;
  }
}
