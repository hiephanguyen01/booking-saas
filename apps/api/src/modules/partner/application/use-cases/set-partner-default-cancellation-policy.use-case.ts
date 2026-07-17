import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
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
    @Inject(PARTNER_REPOSITORY) private readonly partners: IPartnerRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(partnerId: string, policyId: string | null): Promise<PartnerRecord> {
    const tenantId = await this.partners.tenantIdOfPartner(partnerId);
    if (!tenantId) {
      throw new NotFoundException({
        statusCode: 404,
        code: 'PARTNER_NOT_FOUND',
        message: 'Partner not found',
      });
    }
    return this.tenantDb.forTenant(tenantId, async (tx) => {
      if (policyId !== null) {
        const policy = await tx.cancellationPolicy.findFirst({
          where: { id: policyId, OR: [{ partnerId: null }, { partnerId }] },
          select: { id: true },
        });
        if (!policy) {
          throw new NotFoundException({
            statusCode: 404,
            code: 'CANCELLATION_POLICY_NOT_FOUND',
            message: 'Cancellation policy not found',
          });
        }
      }
      return this.partners.update(tx, partnerId, { defaultCancellationPolicyId: policyId });
    });
  }
}
