import {
  activeRevenueJournalId,
  buildCancellationFeeJournal,
  buildClawbackJournal,
  buildPayoutJournal,
  buildRevenueJournal,
  hasRevenueJournal,
  type JournalLeg,
  type RevenueJournalInput,
} from '../ledger-journal';

/** Aggregate façade for append-only balanced journals; builders remain the single arithmetic source. */
export class LedgerJournal {
  private constructor() {}

  static revenue(input: RevenueJournalInput): JournalLeg[] {
    return buildRevenueJournal(input);
  }

  static cancellationFee(input: { tenantId: string; retained: bigint }): JournalLeg[] {
    return buildCancellationFeeJournal(input);
  }

  static payout(input: {
    tenantId: string;
    payeeType: 'partner' | 'affiliate';
    payeeId: string;
    amount: bigint;
  }): JournalLeg[] {
    return buildPayoutJournal(input);
  }

  static clawback(original: JournalLeg[]): JournalLeg[] {
    return buildClawbackJournal(original);
  }

  static activeRevenueId(
    entries: ReadonlyArray<{ journalId: string; entryType: JournalLeg['entryType'] }>,
  ): string | null {
    return activeRevenueJournalId(entries);
  }

  static hasRevenue(
    entries: ReadonlyArray<{ journalId: string; entryType: JournalLeg['entryType'] }>,
  ): boolean {
    return hasRevenueJournal(entries);
  }
}
