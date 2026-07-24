import { Inject, Injectable } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  LEDGER_REPOSITORY,
  type ILedgerRepository,
} from '../../domain/ports/ledger-repository.port';
import type { JournalLeg } from '../../domain/ledger-journal';
import {
  SETTLEMENT_REPOSITORY,
  type ISettlementRepository,
} from '../../domain/ports/settlement-repository.port';
import { Settlement } from '../../domain/entities/settlement.entity';
import { LedgerJournal } from '../../domain/entities/ledger-journal.entity';

/**
 * Post-completion dispute/refund → a clawback reversing the completion journal
 * (§13.1). Partner/affiliate balances may go negative — recovered next payout.
 * Idempotent — the outbox delivers at least once, so we guard on an existing
 * clawback before writing. Opens its own `forTenant` transaction (outbox handlers
 * have no request context).
 */
@Injectable()
export class RecordClawbackJournalUseCase {
  constructor(
    @Inject(LEDGER_REPOSITORY) private readonly ledger: ILedgerRepository,
    @Inject(SETTLEMENT_REPOSITORY) private readonly settlements: ISettlementRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(tenantId: string, bookingId: string): Promise<void> {
    await this.tenantDb.forTenant(tenantId, async (tx) => {
      const settlement = await this.settlements.findByBooking(tx, bookingId);
      // A partial refund can later release the retained balance. A delayed or
      // duplicate old event must never reverse that newly-released journal.
      if (!settlement || !Settlement.rehydrate(settlement).canRecordClawback()) return;
      const entries = await this.ledger.entriesForBooking(tx, bookingId);
      const activeJournalId = LedgerJournal.activeRevenueId(entries);
      if (!activeJournalId) return;
      const original = entries.filter(
        (entry) => entry.journalId === activeJournalId && entry.payoutId === null,
      );
      if (original.length === 0) return;
      const legs: JournalLeg[] = LedgerJournal.clawback(
        original.map((e) => ({
          owner: { ownerType: e.ownerType, ownerId: e.ownerId },
          entryType: e.entryType,
          debit: e.debit,
          credit: e.credit,
        })),
      );
      await this.ledger.recordJournal(tx, tenantId, legs, {
        bookingId,
        memo: `settlement.clawback:${activeJournalId}`,
      });
    });
  }
}
