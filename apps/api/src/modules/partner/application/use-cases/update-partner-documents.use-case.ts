import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { UpdatePartnerDocumentsInput } from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
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
    @Inject(PARTNER_REPOSITORY) private readonly partners: IPartnerRepository,
    private readonly tenantDb: TenantDbService,
    private readonly outbox: OutboxService,
  ) {}

  async execute(partnerId: string, input: UpdatePartnerDocumentsInput): Promise<PartnerRecord> {
    const tenantId = await this.partners.tenantIdOfPartner(partnerId);
    if (!tenantId) {
      throw new NotFoundException({
        statusCode: 404,
        code: 'PARTNER_NOT_FOUND',
        message: 'Partner not found',
      });
    }
    return this.tenantDb.forTenant(tenantId, async (tx) => {
      const current = await this.partners.findById(tx, partnerId);
      if (!current) {
        throw new NotFoundException({
          statusCode: 404,
          code: 'PARTNER_NOT_FOUND',
          message: 'Partner not found',
        });
      }
      // Merge onto the existing blob so taxId/businessRegistrationNo survive.
      const businessInfo: Record<string, unknown> = { ...current.businessInfo };
      if (input.logoUrl !== undefined) businessInfo.logoUrl = input.logoUrl;
      if (input.licenseDocs !== undefined) businessInfo.licenseDocs = input.licenseDocs;

      const updated = await this.partners.update(tx, partnerId, { businessInfo });
      await this.outbox.emit(tx, {
        tenantId,
        eventType: 'partner.documents_updated',
        payload: { partnerId },
      });
      return updated;
    });
  }
}
