import { Inject, Injectable } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { PartnerNotFound } from '../../../../shared/domain/errors/partner-not-found';
import {
  PARTNER_READER,
  type IPartnerReader,
  type PartnerRecord,
} from '../../domain/ports/partner-reader.port';

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
    @Inject(PARTNER_READER) private readonly partners: IPartnerReader,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(partnerId: string): Promise<PartnerRecord> {
    const tenantId = await this.partners.tenantIdOfPartner(partnerId);
    if (!tenantId) {
      throw new PartnerNotFound();
    }
    const partner = await this.tenantDb.forTenant(tenantId, (tx) =>
      this.partners.findById(tx, partnerId),
    );
    if (!partner) {
      throw new PartnerNotFound();
    }
    return partner;
  }
}
