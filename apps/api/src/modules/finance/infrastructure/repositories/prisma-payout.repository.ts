import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import type {
  CreatePayoutData,
  IPayoutRepository,
  PayoutRecord,
} from '../../domain/ports/payout-repository.port';
import { utcNow } from '../../../../shared/time/time';
import { pageOffset } from '../../../../shared/pagination/pagination';

type Row = Prisma.PayoutGetPayload<Record<string, never>>;

function toRecord(p: Row): PayoutRecord {
  return {
    id: p.id,
    tenantId: p.tenantId,
    payeeType: p.payeeType,
    payeeId: p.payeeId,
    amount: p.amount,
    periodFrom: p.periodFrom,
    periodTo: p.periodTo,
    status: p.status,
    paidAt: p.paidAt,
    evidence: (p.evidence as PayoutRecord['evidence']) ?? null,
    createdBy: p.createdBy,
    createdAt: p.createdAt,
  };
}

@Injectable()
export class PrismaPayoutRepository implements IPayoutRepository {
  async lockPayee(
    tx: PrismaTx,
    payeeType: PayoutRecord['payeeType'],
    payeeId: string,
  ): Promise<void> {
    await tx.$executeRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`payout:${payeeType}:${payeeId}`}, 0))`,
    );
  }

  async create(tx: PrismaTx, tenantId: string, data: CreatePayoutData): Promise<PayoutRecord> {
    return toRecord(
      await tx.payout.create({
        data: {
          tenantId,
          payeeType: data.payeeType,
          payeeId: data.payeeId,
          amount: data.amount,
          periodFrom: data.periodFrom,
          periodTo: data.periodTo,
          status: 'pending',
          createdBy: data.createdBy,
        },
      }),
    );
  }

  async findById(tx: PrismaTx, id: string): Promise<PayoutRecord | null> {
    const p = await tx.payout.findUnique({ where: { id } });
    return p ? toRecord(p) : null;
  }

  async list(
    tx: PrismaTx,
    params: { page: number; pageSize: number },
  ): Promise<{ items: PayoutRecord[]; total: number }> {
    const { skip, take } = pageOffset(params);
    const [rows, total] = await Promise.all([
      tx.payout.findMany({ orderBy: { createdAt: 'desc' }, skip, take }),
      tx.payout.count(),
    ]);
    return { items: rows.map(toRecord), total };
  }

  async listForPayee(
    tx: PrismaTx,
    payeeType: PayoutRecord['payeeType'],
    payeeId: string,
    params: { page: number; pageSize: number },
  ): Promise<{ items: PayoutRecord[]; total: number }> {
    const where: Prisma.PayoutWhereInput = { payeeType, payeeId };
    const { skip, take } = pageOffset(params);
    const [rows, total] = await Promise.all([
      tx.payout.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
      tx.payout.count({ where }),
    ]);
    return { items: rows.map(toRecord), total };
  }

  async claimForPayment(tx: PrismaTx, id: string): Promise<PayoutRecord | null> {
    const changed = await tx.payout.updateMany({
      where: { id, status: 'pending' },
      data: { status: 'processing' },
    });
    return changed.count > 0 ? this.findById(tx, id) : null;
  }

  async markPaid(
    tx: PrismaTx,
    id: string,
    evidence: { reference: string; evidenceKey?: string },
  ): Promise<PayoutRecord | null> {
    const changed = await tx.payout.updateMany({
      where: { id, status: 'processing' },
      data: { status: 'paid', paidAt: utcNow(), evidence: { ...evidence } },
    });
    return changed.count > 0 ? this.findById(tx, id) : null;
  }

  async markFailed(tx: PrismaTx, id: string, reason: string | null): Promise<PayoutRecord | null> {
    const changed = await tx.payout.updateMany({
      where: { id, status: { in: ['pending', 'processing'] } },
      data: { status: 'failed', evidence: { failureReason: reason ?? 'unspecified' } },
    });
    return changed.count > 0 ? this.findById(tx, id) : null;
  }

  async outstandingForPayee(
    tx: PrismaTx,
    payeeType: PayoutRecord['payeeType'],
    payeeId: string,
  ): Promise<bigint> {
    const agg = await tx.payout.aggregate({
      where: { payeeType, payeeId, status: { in: ['pending', 'processing'] } },
      _sum: { amount: true },
    });
    return agg._sum.amount ?? 0n;
  }

  async allocateReleasedSettlements(
    tx: PrismaTx,
    tenantId: string,
    payoutId: string,
    partnerId: string,
    amount: bigint,
  ): Promise<bigint> {
    const rows = await tx.$queryRaw<Array<{ id: string; remaining: bigint }>>(Prisma.sql`
      SELECT bs.id,
             GREATEST(
               bs.partner_payable - COALESCE(SUM(pa.amount) FILTER (
                 WHERE pa.status IN ('reserved', 'paid')
               ), 0),
               0
             )::bigint AS remaining
      FROM booking_settlements bs
      LEFT JOIN payout_allocations pa ON pa.settlement_id = bs.id
      WHERE bs.tenant_id = ${tenantId}::uuid
        AND bs.partner_id = ${partnerId}::uuid
        AND bs.status = 'released'::settlement_status
        AND bs.partner_payable > 0
      GROUP BY bs.id
      HAVING bs.partner_payable - COALESCE(SUM(pa.amount) FILTER (
        WHERE pa.status IN ('reserved', 'paid')
      ), 0) > 0
      ORDER BY bs.released_at, bs.id`);

    let left = amount;
    let allocated = 0n;
    for (const row of rows) {
      if (left <= 0n) break;
      const take = row.remaining < left ? row.remaining : left;
      await tx.payoutAllocation.create({
        data: { tenantId, payoutId, settlementId: row.id, amount: take },
      });
      allocated += take;
      left -= take;
    }
    return allocated;
  }

  async markAllocationsPaid(tx: PrismaTx, payoutId: string): Promise<void> {
    await tx.payoutAllocation.updateMany({
      where: { payoutId, status: 'reserved' },
      data: { status: 'paid' },
    });
  }

  async releaseAllocations(tx: PrismaTx, payoutId: string): Promise<void> {
    await tx.payoutAllocation.updateMany({
      where: { payoutId, status: 'reserved' },
      data: { status: 'released' },
    });
  }
}
