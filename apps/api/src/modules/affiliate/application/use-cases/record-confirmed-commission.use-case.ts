import { Inject, Injectable } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { computeAffiliateCommission } from '../../domain/affiliate-commission-amount';
import {
  AFFILIATE_COMMISSION_REPOSITORY,
  type IAffiliateCommissionRepository,
} from '../../domain/ports/affiliate-commission-repository.port';
import { loadBookingFinanceView } from '../booking-finance-view';

/**
 * booking.completed → confirm the commission on final + additional charges
 * (§7.8). The amount is replayed from the booking's frozen `commission_snapshot`
 * via the shared finance split maths, so a commission always equals its ledger
 * leg. Idempotent (the row is keyed by the unique `booking_id`) and opens its
 * own `forTenant` tx — outbox handlers carry no request context.
 */
@Injectable()
export class RecordConfirmedCommissionUseCase {
  constructor(
    @Inject(AFFILIATE_COMMISSION_REPOSITORY) private readonly commissions: IAffiliateCommissionRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(tenantId: string, bookingId: string): Promise<void> {
    await this.tenantDb.forTenant(tenantId, async (tx) => {
      const booking = await loadBookingFinanceView(tx, bookingId);
      if (!booking) return;
      const existing = await this.commissions.findByBooking(tx, bookingId);
      if (existing && existing.status !== 'pending' && existing.status !== 'confirmed') return;
      const amount = computeAffiliateCommission({
        snapshot: booking.snapshot,
        totalAmount: booking.totalAmount,
        finalAmount: booking.finalAmount,
        additionalCharges: booking.additionalCharges,
        fundedBy: booking.fundedBy,
      });
      await this.commissions.upsert(tx, tenantId, {
        affiliateId: booking.affiliateId,
        bookingId,
        amount,
        status: 'confirmed',
      });
    });
  }
}
