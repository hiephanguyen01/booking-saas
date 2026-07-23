import { Inject, Injectable } from '@nestjs/common';
import type { SubmitIdentityInput } from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import { Partner } from '../../domain/entities/partner.entity';
import { PartnerNotFound } from '../../domain/errors/partner-errors';
import { PARTNER_READER, type IPartnerReader } from '../../domain/ports/partner-reader.port';
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
    @Inject(PARTNER_READER) private readonly partnerReader: IPartnerReader,
    @Inject(PARTNER_REPOSITORY) private readonly partners: IPartnerRepository,
    private readonly tenantDb: TenantDbService,
    private readonly outbox: OutboxService,
  ) {}

  async execute(partnerId: string, input: SubmitIdentityInput): Promise<PartnerRecord> {
    const tenantId = await this.partnerReader.tenantIdOfPartner(partnerId);
    if (!tenantId) throw new PartnerNotFound();

    return this.tenantDb.forTenant(tenantId, async (tx) => {
      const intent = Partner.submitIdentity({
        dateOfBirth: new Date(`${input.dateOfBirth}T00:00:00.000Z`),
        documentType: input.documentType,
        documentNumber: input.documentNumber,
        holderName: input.holderName,
      });
      const updated = await this.partners.updateIdentitySubmission(tx, partnerId, intent);
      await this.outbox.emit(tx, {
        tenantId,
        eventType: 'partner.identity_submitted',
        payload: { partnerId },
      });
      return updated;
    });
  }
}
