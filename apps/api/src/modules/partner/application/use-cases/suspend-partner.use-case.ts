import { Inject, Injectable } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import { Partner } from '../../domain/entities/partner.entity';
import { PartnerNotFound } from '../../domain/errors/partner-errors';
import {
  PARTNER_REPOSITORY,
  type IPartnerRepository,
  type PartnerRecord,
} from '../../domain/ports/partner-repository.port';

/**
 * Tenant suspends a partner (§7.3). Blocked while the partner still has active
 * (confirmed) bookings — those must be resolved first (bulk cancel + refund is a
 * later booking-module flow).
 */
@Injectable()
export class SuspendPartnerUseCase {
  constructor(
    @Inject(PARTNER_REPOSITORY) private readonly partners: IPartnerRepository,
    private readonly tenantDb: TenantDbService,
    private readonly outbox: OutboxService,
  ) {}

  async execute(tenantId: string, partnerId: string): Promise<PartnerRecord> {
    return this.tenantDb.forTenant(tenantId, async (tx) => {
      const partner = await this.partners.findById(tx, partnerId);
      if (!partner) throw new PartnerNotFound();

      const futureConfirmedBookingCount = await this.partners.countActiveBookings(tx, partnerId);
      const statusIntent = Partner.rehydrate(partner).suspend(futureConfirmedBookingCount);
      const updated = await this.partners.updateStatus(tx, partnerId, statusIntent);
      await this.outbox.emit(tx, {
        tenantId,
        eventType: 'partner.suspended',
        payload: { partnerId },
      });
      return updated;
    });
  }
}
