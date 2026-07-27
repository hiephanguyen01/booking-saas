import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import type { RepoPage } from '../../../../shared/pagination/pagination';
import type {
  ILedgerRepository,
  LedgerEntryRecord,
  LedgerEntryView,
  LedgerFilters,
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

interface ViewRow {
  id: string;
  journal_id: string;
  owner_type: OwnerType;
  owner_id: string | null;
  owner_name: string | null;
  entry_type: LedgerEntryType;
  debit: bigint;
  credit: bigint;
  booking_id: string | null;
  payment_id: string | null;
  payout_id: string | null;
  memo: string | null;
  created_at: Date;
}

function toView(r: ViewRow): LedgerEntryView {
  return {
    id: r.id,
    journalId: r.journal_id,
    ownerType: r.owner_type,
    ownerId: r.owner_id,
    ownerName: r.owner_name,
    entryType: r.entry_type,
    debit: r.debit,
    credit: r.credit,
    bookingId: r.booking_id,
    paymentId: r.payment_id,
    payoutId: r.payout_id,
    memo: r.memo,
    createdAt: r.created_at,
  };
}

/**
 * Ledger lines joined to their owner's display name, so the ledger view renders a
 * name instead of a raw UUID fragment.
 *
 * Owner resolution crosses into other modules' tables, so it is deliberately
 * **read-only SQL inside this repository** rather than a call into another
 * module's service (CLAUDE.md §2.1 rule 5). It stays tenant-safe because every
 * entry point is RLS-scoped: `ledger_accounts`, `partners` and `affiliates` all
 * carry a `tenant_isolation` policy, so a row can only ever reach the current
 * tenant's partner/affiliate — and `users` (which has no RLS of its own, being
 * global) is only reachable *through* an already-RLS-filtered `affiliates` row.
 *
 * `tenants` is joined on the account's `tenant_id`, not `owner_id`, so both tenant
 * sub-accounts resolve to the tenant name — `tenant/cash` carries `owner_id = null`
 * while `tenant/revenue` carries `owner_id = tenantId` (see `ledger-journal.ts`),
 * and `owner_id` remains the field that tells the two apart.
 */
const VIEW_SELECT = Prisma.sql`
  SELECT le.id, le.journal_id, le.entry_type, le.debit, le.credit,
         le.booking_id, le.payment_id, le.payout_id, le.memo, le.created_at,
         la.owner_type, la.owner_id,
         COALESCE(p.name, u.full_name, t.name) AS owner_name
  FROM ledger_entries le
  JOIN ledger_accounts la ON la.id = le.account_id
  LEFT JOIN partners p ON la.owner_type = 'partner' AND p.id = la.owner_id
  LEFT JOIN affiliates a ON la.owner_type = 'affiliate' AND a.id = la.owner_id
  LEFT JOIN users u ON u.id = a.user_id
  LEFT JOIN tenants t ON la.owner_type = 'tenant' AND t.id = la.tenant_id`;

/** Build the ANDed WHERE clause for the ledger view filters. */
function viewConditions(filters: LedgerFilters): Prisma.Sql {
  const conds: Prisma.Sql[] = [];
  if (filters.bookingId) conds.push(Prisma.sql`le.booking_id = ${filters.bookingId}::uuid`);
  if (filters.ownerType)
    conds.push(Prisma.sql`la.owner_type = ${filters.ownerType}::ledger_owner_type`);
  if (filters.ownerId) conds.push(Prisma.sql`la.owner_id = ${filters.ownerId}::uuid`);
  if (filters.entryType)
    conds.push(Prisma.sql`le.entry_type = ${filters.entryType}::ledger_entry_type`);
  if (filters.from) conds.push(Prisma.sql`le.created_at >= ${filters.from}`);
  if (filters.to) conds.push(Prisma.sql`le.created_at <= ${filters.to}`);
  return conds.length ? Prisma.sql`WHERE ${Prisma.join(conds, ' AND ')}` : Prisma.empty;
}

@Injectable()
export class PrismaLedgerRepository implements ILedgerRepository {
  async recordJournal(
    tx: PrismaTx,
    tenantId: string,
    legs: JournalLeg[],
    refs: RecordJournalRefs,
  ): Promise<string> {
    const journalId = randomUUID();
    for (const leg of legs) {
      const accountId = await this.ensureAccount(
        tx,
        tenantId,
        leg.owner.ownerType,
        leg.owner.ownerId,
      );
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
          availableAt: refs.availableAt,
        },
      });
    }
    return journalId;
  }

  async entriesForBooking(tx: PrismaTx, bookingId: string): Promise<LedgerEntryRecord[]> {
    const rows = await tx.ledgerEntry.findMany({
      where: { bookingId },
      include: { account: true },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return rows.map(toRecord);
  }

  async ownerBalance(
    tx: PrismaTx,
    ownerType: OwnerType,
    ownerId: string | null,
  ): Promise<OwnerBalance> {
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
    const rows = await tx.$queryRaw<
      { owner_id: string | null; debit: bigint; credit: bigint }[]
    >(Prisma.sql`
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
  ): Promise<LedgerEntryView[]> {
    const rows = await tx.$queryRaw<ViewRow[]>(Prisma.sql`
      ${VIEW_SELECT}
      WHERE la.owner_type = ${ownerType}::ledger_owner_type
        AND la.owner_id IS NOT DISTINCT FROM ${ownerId}::uuid
      ORDER BY le.created_at DESC, le.id DESC
      LIMIT ${limit}`);
    return rows.map(toView);
  }

  async listEntries(
    tx: PrismaTx,
    page: number,
    pageSize: number,
    filters: LedgerFilters,
  ): Promise<RepoPage<LedgerEntryView>> {
    const where = viewConditions(filters);
    const [rows, counted] = await Promise.all([
      tx.$queryRaw<ViewRow[]>(Prisma.sql`
        ${VIEW_SELECT}
        ${where}
        ORDER BY le.created_at DESC, le.id DESC
        LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`),
      // Counted through the same joins + WHERE so the total always matches the
      // filtered page (a plain count() would report the unfiltered total).
      tx.$queryRaw<{ total: bigint }[]>(Prisma.sql`
        SELECT COUNT(*)::bigint AS total
        FROM ledger_entries le
        JOIN ledger_accounts la ON la.id = le.account_id
        ${where}`),
    ]);
    return { items: rows.map(toView), total: Number(counted[0]?.total ?? 0n) };
  }

  async maturePayable(
    tx: PrismaTx,
    ownerType: OwnerType,
    ownerId: string | null,
  ): Promise<{ amount: bigint; cutoff: Date }> {
    const rows = await tx.$queryRaw<Array<{ amount: bigint; cutoff: Date }>>(Prisma.sql`
      WITH db_clock AS (SELECT now() AS cutoff)
      SELECT COALESCE(SUM(
               CASE WHEN le.available_at <= db_clock.cutoff OR le.entry_type IN ('payout', 'clawback')
                    THEN le.credit - le.debit ELSE 0 END
             ), 0)::bigint AS amount,
             db_clock.cutoff
      FROM db_clock
      LEFT JOIN ledger_accounts la
        ON la.owner_type = ${ownerType}::ledger_owner_type
       AND la.owner_id IS NOT DISTINCT FROM ${ownerId}::uuid
      LEFT JOIN ledger_entries le ON le.account_id = la.id
      GROUP BY db_clock.cutoff`);
    const result = rows[0];
    if (!result) throw new Error('Mature payable query returned no row');
    return result;
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
