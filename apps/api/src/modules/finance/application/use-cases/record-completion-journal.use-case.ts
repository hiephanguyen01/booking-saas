import { Inject, Injectable, Logger } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { LEDGER_REPOSITORY, type ILedgerRepository } from '../../domain/ports/ledger-repository.port';
import { computeCommissionSplit } from '../../domain/commission-split';
import { buildRevenueJournal, hasRevenueJournal } from '../../domain/ledger-journal';
import { snapshotToRates } from '../../domain/commission-snapshot';
import { loadBookingFinanceView } from '../booking-finance-view';

/**
 * booking.completed → the commission journal from the frozen snapshot (§13.1).
 * Idempotent — the outbox delivers at least once, so we guard on the existence of
 * the booking's ledger entries before writing. Opens its own `forTenant`
 * transaction (outbox handlers have no request context).
 */
@Injectable()
export class RecordCompletionJournalUseCase {
  private readonly logger = new Logger(RecordCompletionJournalUseCase.name);

  constructor(
    @Inject(LEDGER_REPOSITORY) private readonly ledger: ILedgerRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(tenantId: string, bookingId: string): Promise<void> {
    await this.tenantDb.forTenant(tenantId, async (tx) => {
      if (hasRevenueJournal(await this.ledger.entriesForBooking(tx, bookingId))) return;
      const booking = await loadBookingFinanceView(tx, bookingId);
      if (!booking) return;

      const addl = booking.additionalCharges;
      const effectiveFinal = booking.finalAmount + addl;
      const effectiveTotal = booking.totalAmount + addl;
      const rates = snapshotToRates(booking.snapshot);
      const split = computeCommissionSplit({
        totalAmount: effectiveTotal,
        finalAmount: effectiveFinal,
        fundedBy: booking.fundedBy,
        hasAffiliate: booking.affiliateId !== null,
        rates,
      });
      if (split.flags.length > 0) {
        this.logger.warn(`booking ${bookingId} commission split flags: ${split.flags.join(', ')}`);
      }
      const legs = buildRevenueJournal({
        tenantId,
        partnerId: booking.partnerId,
        affiliateId: booking.affiliateId,
        isHouse: booking.snapshot.isHouse,
        commissionBase: effectiveFinal,
        cashViaGateway: booking.paidAmount,
        additionalCharges: addl,
        split,
        cashEntryType: 'booking_revenue',
      });
      await this.ledger.recordJournal(tx, tenantId, legs, { bookingId, memo: 'booking.completed' });
    });
  }
}
