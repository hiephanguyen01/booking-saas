import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import type {
  AffiliateCommissionRecord,
  AffiliateCommissionStatus,
  AffiliateCommissionTotals,
  AffiliateCommissionWithBooking,
  IAffiliateCommissionRepository,
} from '../../domain/ports/affiliate-commission-repository.port';

type RowWithBooking = Prisma.AffiliateCommissionGetPayload<{ include: typeof WITH_BOOKING }>;

// A commission row is meaningless on its own: the affiliate needs to know which
// booking (code, listing, amount) earned it and what state that booking is in.
const WITH_BOOKING = {
  booking: {
    select: { code: true, status: true, finalAmount: true, listing: { select: { title: true } } },
  },
} as const;

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
    bookingStatus: c.booking?.status ?? null,
    bookingTotal: c.booking?.finalAmount ?? null,
    listingTitle: c.booking?.listing?.title ?? null,
    // There is no `paid_at` column on affiliate_commissions; `paid` is terminal
    // (markConfirmedPaid is the only transition into it and nothing leaves it
    // except a clawback), so the row's last write IS the settlement instant.
    paidAt: c.status === 'paid' ? c.updatedAt : null,
  };
}

@Injectable()
export class PrismaAffiliateCommissionRepository implements IAffiliateCommissionRepository {
  async findByBooking(tx: PrismaTx, bookingId: string): Promise<AffiliateCommissionRecord | null> {
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
      include: WITH_BOOKING,
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
    const totals: AffiliateCommissionTotals = {
      pending: 0n,
      confirmed: 0n,
      paid: 0n,
      reversed: 0n,
      clawedBack: 0n,
      bookings: 0,
    };
    for (const g of grouped) {
      const sum = g._sum.amount ?? 0n;
      if (g.status === 'pending') totals.pending = sum;
      else if (g.status === 'confirmed') totals.confirmed = sum;
      else if (g.status === 'paid') totals.paid = sum;
      else if (g.status === 'reversed') totals.reversed = sum;
      else if (g.status === 'clawed_back') totals.clawedBack = sum;
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
