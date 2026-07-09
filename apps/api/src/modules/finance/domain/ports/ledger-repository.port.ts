import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import type { JournalLeg, LedgerEntryType, OwnerType } from '../ledger-journal';

export const LEDGER_REPOSITORY = Symbol('LEDGER_REPOSITORY');

export interface LedgerEntryRecord {
  id: string;
  journalId: string;
  ownerType: OwnerType;
  ownerId: string | null;
  entryType: LedgerEntryType;
  debit: bigint;
  credit: bigint;
  bookingId: string | null;
  paymentId: string | null;
  payoutId: string | null;
  memo: string | null;
  createdAt: Date;
}

export interface RecordJournalRefs {
  bookingId?: string | null;
  paymentId?: string | null;
  payoutId?: string | null;
  memo?: string | null;
}

export interface OwnerBalance {
  ownerType: OwnerType;
  ownerId: string | null;
  debit: bigint;
  credit: bigint;
}

export interface ILedgerRepository {
  /**
   * Persist a whole balanced journal under one fresh `journal_id`, resolving each
   * leg's owner to a `ledger_account` (created on first use). All inserts happen in
   * the caller's tx so the deferred balance trigger validates them together.
   */
  recordJournal(tx: PrismaTx, tenantId: string, legs: JournalLeg[], refs: RecordJournalRefs): Promise<string>;
  /** Existing entries for a booking (for idempotency guards + clawback reversal). */
  entriesForBooking(tx: PrismaTx, bookingId: string): Promise<LedgerEntryRecord[]>;
  /** Net balance for one owner (RLS-scoped): credit − debit. */
  ownerBalance(tx: PrismaTx, ownerType: OwnerType, ownerId: string | null): Promise<OwnerBalance>;
  /** All non-zero owner balances of a given type for the current tenant. */
  balancesByType(tx: PrismaTx, ownerType: OwnerType): Promise<OwnerBalance[]>;
  /** Recent ledger entries for one owner (partner/affiliate history). */
  entriesForOwner(tx: PrismaTx, ownerType: OwnerType, ownerId: string | null, limit: number): Promise<LedgerEntryRecord[]>;
  /**
   * Paginated journal/ledger lines for the current tenant (RLS-scoped), newest
   * first — the tenant finance ledger view (§13.3). Returns the page + the total.
   */
  listEntries(tx: PrismaTx, page: number, pageSize: number): Promise<{ items: LedgerEntryRecord[]; total: number }>;
  /**
   * Payable that has cleared the holding period (§7.7): net (credit − debit) over
   * the owner's entries older than `cutoff`, while settlements (payout/clawback)
   * always count so a recent payout still reduces what is available.
   */
  maturePayable(tx: PrismaTx, ownerType: OwnerType, ownerId: string | null, cutoff: Date): Promise<bigint>;
}
