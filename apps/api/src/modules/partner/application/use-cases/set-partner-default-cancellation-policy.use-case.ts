import { Inject, Injectable } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { Partner } from '../../domain/entities/partner.entity';
import { PartnerNotFound } from '../../domain/errors/partner-errors';
import { PARTNER_READER, type IPartnerReader } from '../../domain/ports/partner-reader.port';
import {
  PARTNER_REPOSITORY,
  type IPartnerRepository,
  type PartnerRecord,
} from '../../domain/ports/partner-repository.port';

/**
 * A partner picks the fallback cancellation policy applied to any of its listings
 * that set none (§11.3). The target must be a policy the partner may use — one it
 * owns or a tenant-level shared policy. `null` clears the default (falls back to the
 * tenant default). Reads `cancellation_policies` on the same tx (no cross-module import).
 */
@Injectable()
export class SetPartnerDefaultCancellationPolicyUseCase {
  constructor(
    @Inject(PARTNER_READER) private readonly partnerReader: IPartnerReader,
    @Inject(PARTNER_REPOSITORY) private readonly partners: IPartnerRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(partnerId: string, policyId: string | null): Promise<PartnerRecord> {
    const tenantId = await this.partnerReader.tenantIdOfPartner(partnerId);
    if (!tenantId) throw new PartnerNotFound();

    return this.tenantDb.forTenant(tenantId, async (tx) => {
      const isVisible =
        policyId === null
          ? true
          : await this.partners.isCancellationPolicyVisible(tx, partnerId, policyId);
      const intent = Partner.setDefaultCancellationPolicy(policyId, isVisible);
      return this.partners.updateDefaultCancellationPolicy(tx, partnerId, intent);
    });
  }
}
