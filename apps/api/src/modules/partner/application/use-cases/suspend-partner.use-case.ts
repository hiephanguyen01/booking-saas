import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
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
      if (!partner) {
        throw new NotFoundException({
          statusCode: 404,
          code: 'PARTNER_NOT_FOUND',
          message: 'Partner not found',
        });
      }
      const active = await this.partners.countActiveBookings(tx, partnerId);
      if (active > 0) {
        throw new ConflictException({
          statusCode: 409,
          code: 'PARTNER_HAS_ACTIVE_BOOKINGS',
          message: 'Cannot suspend a partner with active bookings',
        });
      }
      const updated = await this.partners.update(tx, partnerId, { status: 'suspended' });
      await this.outbox.emit(tx, {
        tenantId,
        eventType: 'partner.suspended',
        payload: { partnerId },
      });
      return updated;
    });
  }
}
