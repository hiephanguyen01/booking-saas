import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { UpdatePayoutInfoInput } from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
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
    @Inject(PARTNER_REPOSITORY) private readonly partners: IPartnerRepository,
    private readonly tenantDb: TenantDbService,
    private readonly outbox: OutboxService,
  ) {}

  async execute(partnerId: string, input: UpdatePayoutInfoInput): Promise<PartnerRecord> {
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
        payoutInfo: {
          bank: input.bank,
          accountNumber: input.accountNumber,
          holderName: input.holderName,
        },
      });
      await this.outbox.emit(tx, {
        tenantId,
        eventType: 'partner.payout_updated',
        payload: { partnerId },
      });
      return updated;
    });
  }
}
