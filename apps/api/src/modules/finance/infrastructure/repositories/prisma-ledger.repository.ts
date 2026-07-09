import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import type {
  ILedgerRepository,
  LedgerEntryRecord,
  OwnerBalance,
  RecordJournalRefs,
} from '../../domain/ports/ledger-repository.port';
import type { JournalLeg, LedgerEntryType, OwnerType } from '../../domain/ledger-journal';

type EntryRow = Prisma.LedgerEntryGetPayload<{ include: { account: true } }>;

function toRecord(e: EntryRow): LedgerEntryRecord {
  return {
    id: e.id,
    journalId: e.journalId,
    ownerType: e.account.ownerType as OwnerType,
    ownerId: e.account.ownerId,
    entryType: e.entryType as LedgerEntryType,
    debit: e.debit,
    credit: e.credit,
    bookingId: e.bookingId,
    paymentId: e.paymentId,
    payoutId: e.payoutId,
    memo: e.memo,
    createdAt: e.createdAt,
  };
}

@Injectable()
export class PrismaLedgerRepository implements ILedgerRepository {
  async recordJournal(tx: PrismaTx, tenantId: string, legs: JournalLeg[], refs: RecordJournalRefs): Promise<string> {
    const journalId = randomUUID();
    for (const leg of legs) {
      const accountId = await this.ensureAccount(tx, tenantId, leg.owner.ownerType, leg.owner.ownerId);
      await tx.ledgerEntry.create({
        data: {
          tenantId,
          journalId,
          accountId,
          entryType: leg.entryType,
          debit: leg.debit,
          credit: leg.credit,
          bookingId: refs.bookingId ?? null,
          paymentId: refs.paymentId ?? null,
          payoutId: refs.payoutId ?? null,
          memo: refs.memo ?? null,
        },
      });
    }
    return journalId;
  }

  async entriesForBooking(tx: PrismaTx, bookingId: string): Promise<LedgerEntryRecord[]> {
    const rows = await tx.ledgerEntry.findMany({
      where: { bookingId },
      include: { account: true },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(toRecord);
  }

  async ownerBalance(tx: PrismaTx, ownerType: OwnerType, ownerId: string | null): Promise<OwnerBalance> {
    const rows = await tx.$queryRaw<{ debit: bigint; credit: bigint }[]>(Prisma.sql`
      SELECT COALESCE(SUM(le.debit), 0)::bigint AS debit,
             COALESCE(SUM(le.credit), 0)::bigint AS credit
      FROM ledger_accounts la
      LEFT JOIN ledger_entries le ON le.account_id = la.id
      WHERE la.owner_type = ${ownerType}::ledger_owner_type
        AND la.owner_id IS NOT DISTINCT FROM ${ownerId}::uuid`);
    const row = rows[0] ?? { debit: 0n, credit: 0n };
    return { ownerType, ownerId, debit: row.debit, credit: row.credit };
  }

  async balancesByType(tx: PrismaTx, ownerType: OwnerType): Promise<OwnerBalance[]> {
    const rows = await tx.$queryRaw<{ owner_id: string | null; debit: bigint; credit: bigint }[]>(Prisma.sql`
      SELECT la.owner_id,
             COALESCE(SUM(le.debit), 0)::bigint AS debit,
             COALESCE(SUM(le.credit), 0)::bigint AS credit
      FROM ledger_accounts la
      LEFT JOIN ledger_entries le ON le.account_id = la.id
      WHERE la.owner_type = ${ownerType}::ledger_owner_type
      GROUP BY la.owner_id`);
    return rows.map((r) => ({ ownerType, ownerId: r.owner_id, debit: r.debit, credit: r.credit }));
  }

  async entriesForOwner(
    tx: PrismaTx,
    ownerType: OwnerType,
    ownerId: string | null,
    limit: number,
  ): Promise<LedgerEntryRecord[]> {
    const rows = await tx.ledgerEntry.findMany({
      where: { account: { ownerType, ownerId } },
      include: { account: true },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return rows.map(toRecord);
  }

  async listEntries(
    tx: PrismaTx,
    page: number,
    pageSize: number,
  ): Promise<{ items: LedgerEntryRecord[]; total: number }> {
    const [rows, total] = await Promise.all([
      tx.ledgerEntry.findMany({
        include: { account: true },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      tx.ledgerEntry.count(),
    ]);
    return { items: rows.map(toRecord), total };
  }

  async maturePayable(tx: PrismaTx, ownerType: OwnerType, ownerId: string | null, cutoff: Date): Promise<bigint> {
    const rows = await tx.$queryRaw<{ balance: bigint }[]>(Prisma.sql`
      SELECT COALESCE(SUM(
               CASE WHEN le.created_at <= ${cutoff} OR le.entry_type IN ('payout', 'clawback')
                    THEN le.credit - le.debit ELSE 0 END
             ), 0)::bigint AS balance
      FROM ledger_accounts la
      JOIN ledger_entries le ON le.account_id = la.id
      WHERE la.owner_type = ${ownerType}::ledger_owner_type
        AND la.owner_id IS NOT DISTINCT FROM ${ownerId}::uuid`);
    return rows[0]?.balance ?? 0n;
  }

  /** Upsert-by-race the singleton account for (tenant, ownerType, ownerId). */
  private async ensureAccount(
    tx: PrismaTx,
    tenantId: string,
    ownerType: OwnerType,
    ownerId: string | null,
  ): Promise<string> {
    const existing = await tx.ledgerAccount.findFirst({ where: { tenantId, ownerType, ownerId } });
    if (existing) return existing.id;
    try {
      const created = await tx.ledgerAccount.create({ data: { tenantId, ownerType, ownerId } });
      return created.id;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const again = await tx.ledgerAccount.findFirst({ where: { tenantId, ownerType, ownerId } });
        if (again) return again.id;
      }
      throw err;
    }
  }
}
