import { Inject, Injectable } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { LEDGER_REPOSITORY, type ILedgerRepository } from '../../domain/ports/ledger-repository.port';
import { buildCancellationFeeJournal, hasRevenueJournal } from '../../domain/ledger-journal';
import { loadBookingFinanceView } from '../booking-finance-view';

/**
 * booking.cancelled → a cancellation_fee journal on the retained portion (§13.1):
 * what the customer paid minus what was refunded. No journal on a full refund.
 * Idempotent — the outbox delivers at least once, so we guard on the existence of
 * the booking's ledger entries before writing. Opens its own `forTenant`
 * transaction (outbox handlers have no request context).
 */
@Injectable()
export class RecordCancellationFeeJournalUseCase {
  constructor(
    @Inject(LEDGER_REPOSITORY) private readonly ledger: ILedgerRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(tenantId: string, bookingId: string, refundAmount: bigint): Promise<void> {
    await this.tenantDb.forTenant(tenantId, async (tx) => {
      if (hasRevenueJournal(await this.ledger.entriesForBooking(tx, bookingId))) return;
      const booking = await loadBookingFinanceView(tx, bookingId);
      if (!booking) return;
      const retained = booking.paidAmount - refundAmount;
      const legs = buildCancellationFeeJournal({ tenantId, retained });
      if (legs.length === 0) return;
      await this.ledger.recordJournal(tx, tenantId, legs, { bookingId, memo: 'booking.cancelled' });
    });
  }
}
