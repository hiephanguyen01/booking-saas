import { Inject, Injectable } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { LEDGER_REPOSITORY, type ILedgerRepository } from '../../domain/ports/ledger-repository.port';
import { buildClawbackJournal, type JournalLeg } from '../../domain/ledger-journal';

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
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(tenantId: string, bookingId: string): Promise<void> {
    await this.tenantDb.forTenant(tenantId, async (tx) => {
      const entries = await this.ledger.entriesForBooking(tx, bookingId);
      const original = entries.filter((e) => e.entryType !== 'clawback' && e.payoutId === null);
      if (original.length === 0) return; // nothing to reverse
      if (entries.some((e) => e.entryType === 'clawback')) return; // already clawed back
      const legs: JournalLeg[] = buildClawbackJournal(
        original.map((e) => ({
          owner: { ownerType: e.ownerType, ownerId: e.ownerId },
          entryType: e.entryType,
          debit: e.debit,
          credit: e.credit,
        })),
      );
      await this.ledger.recordJournal(tx, tenantId, legs, { bookingId, memo: 'booking.clawback' });
    });
  }
}
