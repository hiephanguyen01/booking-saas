import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { SubmitIdentityInput } from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import {
  PARTNER_REPOSITORY,
  type IPartnerRepository,
  type PartnerRecord,
} from '../../domain/ports/partner-repository.port';

/**
 * A partner submits ID-document metadata + date of birth for manual review
 * (§7.3; eKYC automation is Phase 3). Moves verification to `pending` for a
 * tenant admin to approve.
 */
@Injectable()
export class SubmitIdentityUseCase {
  constructor(
    @Inject(PARTNER_REPOSITORY) private readonly partners: IPartnerRepository,
    private readonly tenantDb: TenantDbService,
    private readonly outbox: OutboxService,
  ) {}

  async execute(partnerId: string, input: SubmitIdentityInput): Promise<PartnerRecord> {
    const tenantId = await this.partners.tenantIdOfPartner(partnerId);
    if (!tenantId) {
      throw new NotFoundException({
        statusCode: 404,
        code: 'PARTNER_NOT_FOUND',
        message: 'Partner not found',
      });
    }
    return this.tenantDb.forTenant(tenantId, async (tx) => {
      const updated = await this.partners.update(tx, partnerId, {
        verificationStatus: 'pending',
        dateOfBirth: new Date(`${input.dateOfBirth}T00:00:00.000Z`),
        identityInfo: {
          documentType: input.documentType,
          documentNumber: input.documentNumber,
          holderName: input.holderName,
        },
      });
      await this.outbox.emit(tx, {
        tenantId,
        eventType: 'partner.identity_submitted',
        payload: { partnerId },
      });
      return updated;
    });
  }
}
