import { Inject, Injectable } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  AFFILIATE_COMMISSION_REPOSITORY,
  type IAffiliateCommissionRepository,
} from '../../domain/ports/affiliate-commission-repository.port';

/**
 * booking.cancelled/rejected/expired (pre-completion) → reverse a not-yet-paid
 * commission (§7.8). Idempotent (the row is keyed by the unique `booking_id`)
 * and opens its own `forTenant` tx — outbox handlers carry no request context.
 */
@Injectable()
export class ReverseCommissionUseCase {
  constructor(
    @Inject(AFFILIATE_COMMISSION_REPOSITORY) private readonly commissions: IAffiliateCommissionRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(tenantId: string, bookingId: string): Promise<void> {
    await this.tenantDb.forTenant(tenantId, async (tx) => {
      const existing = await this.commissions.findByBooking(tx, bookingId);
      if (!existing) return;
      if (existing.status === 'pending' || existing.status === 'confirmed') {
        await this.commissions.updateForBooking(tx, bookingId, { status: 'reversed' });
      }
    });
  }
}
