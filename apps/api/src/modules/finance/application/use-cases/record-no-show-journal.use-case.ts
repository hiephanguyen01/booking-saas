import { Inject, Injectable } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { LEDGER_REPOSITORY, type ILedgerRepository } from '../../domain/ports/ledger-repository.port';
import { computeCommissionSplit } from '../../domain/commission-split';
import { buildRevenueJournal, hasRevenueJournal } from '../../domain/ledger-journal';
import { snapshotToRates } from '../../domain/commission-snapshot';
import { loadBookingFinanceView } from '../booking-finance-view';

/**
 * no_show → the commission journal on the actual forfeited paid_amount (§8.5/§13.1).
 * Idempotent — the outbox delivers at least once, so we guard on the existence of
 * the booking's ledger entries before writing. Opens its own `forTenant`
 * transaction (outbox handlers have no request context).
 */
@Injectable()
export class RecordNoShowJournalUseCase {
  constructor(
    @Inject(LEDGER_REPOSITORY) private readonly ledger: ILedgerRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(tenantId: string, bookingId: string): Promise<void> {
    await this.tenantDb.forTenant(tenantId, async (tx) => {
      if (hasRevenueJournal(await this.ledger.entriesForBooking(tx, bookingId))) return;
      const booking = await loadBookingFinanceView(tx, bookingId);
      if (!booking || booking.paidAmount <= 0n) return;

      const rates = snapshotToRates(booking.snapshot);
      const split = computeCommissionSplit({
        totalAmount: booking.paidAmount,
        finalAmount: booking.paidAmount,
        fundedBy: null,
        hasAffiliate: booking.affiliateId !== null,
        rates,
      });
      const legs = buildRevenueJournal({
        tenantId,
        partnerId: booking.partnerId,
        affiliateId: booking.affiliateId,
        isHouse: booking.snapshot.isHouse,
        commissionBase: booking.paidAmount,
        cashViaGateway: booking.paidAmount,
        additionalCharges: 0n,
        split,
        cashEntryType: 'booking_revenue',
      });
      await this.ledger.recordJournal(tx, tenantId, legs, { bookingId, memo: 'booking.no_show' });
    });
  }
}
