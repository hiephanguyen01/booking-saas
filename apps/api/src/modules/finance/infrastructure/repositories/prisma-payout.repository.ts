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

  async markPaid(tx: PrismaTx, id: string, evidence: { reference: string; evidenceKey?: string }): Promise<PayoutRecord> {
    return toRecord(
      await tx.payout.update({
        where: { id },
        data: { status: 'paid', paidAt: utcNow(), evidence: { ...evidence } },
      }),
    );
  }

  async markFailed(tx: PrismaTx, id: string, reason: string | null): Promise<PayoutRecord> {
    return toRecord(
      await tx.payout.update({
        where: { id },
        data: { status: 'failed', evidence: { failureReason: reason ?? 'unspecified' } },
      }),
    );
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
}
