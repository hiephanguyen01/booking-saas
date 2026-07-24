import { Inject, Injectable } from '@nestjs/common';
import type { UpdatePartnerDocumentsInput } from '@booking/contracts';
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
 * A partner uploads its logo + license/business documents after registering
 * (§7.3 — the "register first, then upload" flow). Images are stored via the
 * presign flow; only their URLs land here, merged into `businessInfo` JSON so the
 * existing tax/registration fields are preserved. Only the provided keys change.
 */
@Injectable()
export class UpdatePartnerDocumentsUseCase {
  constructor(
    @Inject(PARTNER_READER) private readonly partnerReader: IPartnerReader,
    @Inject(PARTNER_REPOSITORY) private readonly partners: IPartnerRepository,
    private readonly tenantDb: TenantDbService,
    private readonly outbox: OutboxService,
  ) {}

  async execute(partnerId: string, input: UpdatePartnerDocumentsInput): Promise<PartnerRecord> {
    const tenantId = await this.partnerReader.tenantIdOfPartner(partnerId);
    if (!tenantId) throw new PartnerNotFound();

    return this.tenantDb.forTenant(tenantId, async (tx) => {
      const current = await this.partners.findStateById(tx, partnerId);
      if (!current) throw new PartnerNotFound();

      const intent = Partner.rehydrate(current).mergeDocuments(input);
      const updated = await this.partners.updateBusinessInfo(tx, partnerId, intent);
      await this.outbox.emit(tx, {
        tenantId,
        eventType: 'partner.documents_updated',
        payload: { partnerId },
      });
      return updated;
    });
  }
}
