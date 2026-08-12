import { Inject, Injectable } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import {
  LEDGER_REPOSITORY,
  type ILedgerRepository,
} from '../../domain/ports/ledger-repository.port';
import {
  SETTLEMENT_REPOSITORY,
  type ISettlementRepository,
} from '../../domain/ports/settlement-repository.port';
import { loadBookingFinanceView } from '../booking-finance-view';
import { Settlement } from '../../domain/entities/settlement.entity';
import {
  FinanceBookingNotFound,
  SettlementNotFound,
  SettlementNotReleasable,
} from '../../domain/errors/finance-domain-errors';

/**
 * Release one due settlement and atomically recognize earnings/payables.
 *
 * Release creates NO tax fact. Partner tax was already assessed when the
 * transaction was accepted (`StartSettlementWindowUseCase`), and a refund
 * reverses it (`RecordWithholdingReversalUseCase`). The two lifecycles are
 * independent: this use-case only decides when money becomes payable.
 */
@Injectable()
export class ReleaseSettlementUseCase {
  constructor(
    @Inject(SETTLEMENT_REPOSITORY) private readonly settlements: ISettlementRepository,
    @Inject(LEDGER_REPOSITORY) private readonly ledger: ILedgerRepository,
    private readonly outbox: OutboxService,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(tenantId: string, settlementId: string): Promise<void> {
    await this.tenantDb.forTenant(tenantId, async (tx) => {
      const settlement = await this.settlements.findById(tx, settlementId);
      if (!settlement) throw new SettlementNotFound();
      const aggregate = Settlement.rehydrate(settlement);
      if (!aggregate.isAwaitingRelease()) return;
      const booking = await loadBookingFinanceView(tx, settlement.bookingId);
      if (!booking) {
        throw new FinanceBookingNotFound('Booking not found while releasing settlement');
      }
      const existing = await this.ledger.entriesForBooking(tx, booking.id);
      const plan = aggregate.releasePlan(booking, existing);
      if (!plan) return;
      const journalId = await this.ledger.recordJournal(tx, tenantId, plan.legs, {
        bookingId: booking.id,
        paymentId: settlement.paymentId,
        memo: plan.memo,
      });
      const released = await this.settlements.markReleased(
        tx,
        settlement.id,
        journalId,
        plan.amounts,
      );
      if (!released) throw new SettlementNotReleasable();
      if (!booking.snapshot.isHouse && plan.taxRevenueAmount > 0n) {
        await this.outbox.emit(tx, {
          tenantId,
          eventType: 'finance.partner_revenue_recognized',
          payload: {
            partnerId: booking.partnerId,
            journalId,
            amount: plan.taxRevenueAmount.toString(),
            serviceDate: booking.serviceDate.toISOString(),
            bookingId: booking.id,
          },
        });
      }
    });
  }
}
