import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import type {
  AffiliateCommissionStatus,
  AffiliateCommissionTotals,
  AffiliateCommissionWithBooking,
  IAffiliateCommissionRepository,
} from '../../domain/ports/affiliate-commission-repository.port';

type RowWithBooking = Prisma.AffiliateCommissionGetPayload<{
  include: { booking: { select: { code: true } } };
}>;

function toWithBooking(c: RowWithBooking): AffiliateCommissionWithBooking {
  return {
    id: c.id,
    tenantId: c.tenantId,
    affiliateId: c.affiliateId,
    bookingId: c.bookingId,
    amount: c.amount,
    status: c.status,
    createdAt: c.createdAt,
    bookingCode: c.booking?.code ?? null,
  };
}

@Injectable()
export class PrismaAffiliateCommissionRepository implements IAffiliateCommissionRepository {
  async findByBooking(tx: PrismaTx, bookingId: string) {
    const c = await tx.affiliateCommission.findUnique({ where: { bookingId } });
    if (!c) return null;
    return {
      id: c.id,
      tenantId: c.tenantId,
      affiliateId: c.affiliateId,
      bookingId: c.bookingId,
      amount: c.amount,
      status: c.status,
      createdAt: c.createdAt,
    };
  }

  async upsert(
    tx: PrismaTx,
    tenantId: string,
    data: { affiliateId: string; bookingId: string; amount: bigint; status: AffiliateCommissionStatus },
  ): Promise<void> {
    await tx.affiliateCommission.upsert({
      where: { bookingId: data.bookingId },
      create: {
        tenantId,
        affiliateId: data.affiliateId,
        bookingId: data.bookingId,
        amount: data.amount,
        status: data.status,
      },
      update: { amount: data.amount, status: data.status },
    });
  }

  async updateForBooking(
    tx: PrismaTx,
    bookingId: string,
    data: { status: AffiliateCommissionStatus; amount?: bigint },
  ): Promise<void> {
    await tx.affiliateCommission.update({
      where: { bookingId },
      data: { status: data.status, ...(data.amount !== undefined ? { amount: data.amount } : {}) },
    });
  }

  async listByAffiliate(tx: PrismaTx, affiliateId: string): Promise<AffiliateCommissionWithBooking[]> {
    const rows = await tx.affiliateCommission.findMany({
      where: { affiliateId },
      include: { booking: { select: { code: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toWithBooking);
  }

  async totalsForAffiliate(tx: PrismaTx, affiliateId: string): Promise<AffiliateCommissionTotals> {
    const grouped = await tx.affiliateCommission.groupBy({
      by: ['status'],
      where: { affiliateId },
      _sum: { amount: true },
      _count: { _all: true },
    });
    const totals: AffiliateCommissionTotals = { pending: 0n, confirmed: 0n, paid: 0n, bookings: 0 };
    for (const g of grouped) {
      const sum = g._sum.amount ?? 0n;
      if (g.status === 'pending') totals.pending = sum;
      else if (g.status === 'confirmed') totals.confirmed = sum;
      else if (g.status === 'paid') totals.paid = sum;
      // A booking "counts" while its commission is still live (not reversed/clawed_back).
      if (g.status === 'pending' || g.status === 'confirmed' || g.status === 'paid') {
        totals.bookings += g._count._all;
      }
    }
    return totals;
  }

  async markConfirmedPaid(tx: PrismaTx, affiliateId: string): Promise<void> {
    await tx.affiliateCommission.updateMany({
      where: { affiliateId, status: 'confirmed' },
      data: { status: 'paid' },
    });
  }
}
