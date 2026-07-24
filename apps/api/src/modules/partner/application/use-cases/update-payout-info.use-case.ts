import { Inject, Injectable } from '@nestjs/common';
import type { UpdatePayoutInfoInput } from '@booking/contracts';
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
 * A partner sets its payout bank details (§7.3). `holderName` is later matched
 * against the ID document during identity verification (name matching).
 */
@Injectable()
export class UpdatePayoutInfoUseCase {
  constructor(
    @Inject(PARTNER_READER) private readonly partnerReader: IPartnerReader,
    @Inject(PARTNER_REPOSITORY) private readonly partners: IPartnerRepository,
    private readonly tenantDb: TenantDbService,
    private readonly outbox: OutboxService,
  ) {}

  async execute(partnerId: string, input: UpdatePayoutInfoInput): Promise<PartnerRecord> {
    const tenantId = await this.partnerReader.tenantIdOfPartner(partnerId);
    if (!tenantId) throw new PartnerNotFound();

    return this.tenantDb.forTenant(tenantId, async (tx) => {
      const intent = Partner.replacePayoutInfo({
        bank: input.bank,
        accountNumber: input.accountNumber,
        holderName: input.holderName,
      });
      const updated = await this.partners.updatePayoutInfo(tx, partnerId, intent);
      await this.outbox.emit(tx, {
        tenantId,
        eventType: 'partner.payout_updated',
        payload: { partnerId },
      });
      return updated;
    });
  }
}
