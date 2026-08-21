import { Inject, Injectable } from '@nestjs/common';
import type { UpdatePartnerDocumentsInput } from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import { Partner } from '../../domain/entities/partner.entity';
import { PartnerNotFound } from '../../domain/errors/partner-errors';
import { assertPartnerDocumentReferences } from '../../domain/partner-document-business-info';
import { PARTNER_READER, type IPartnerReader } from '../../domain/ports/partner-reader.port';
import {
  PARTNER_REPOSITORY,
  type IPartnerRepository,
  type PartnerRecord,
} from '../../domain/ports/partner-repository.port';

/**
 * A partner uploads its logo + private license/business documents after registering
 * (§7.3 — the "register first, then upload" flow). The public logo URL and private
 * document keys are merged into `businessInfo` JSON so existing tax/registration
 * fields and legacy read-only document fields remain untouched until migration.
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
    assertPartnerDocumentReferences(partnerId, input.licenseDocumentKeys ?? []);

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
