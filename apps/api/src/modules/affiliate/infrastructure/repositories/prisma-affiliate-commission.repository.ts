import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { pageOffset, type RepoPage } from '../../../../shared/pagination/pagination';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import type {
  AffiliateCommissionState,
  NewAffiliateCommission,
} from '../../domain/entities/affiliate-commission.entity';
import { AFFILIATE_COMMISSION_PAID_SOURCE_STATUS } from '../../domain/entities/affiliate-commission.entity';
import type {
  AffiliateCommissionListFilter,
  AffiliateCommissionTotals,
  AffiliateCommissionWithBooking,
  IAffiliateCommissionReader,
} from '../../domain/ports/affiliate-commission-reader.port';
import type {
  AffiliateCommissionUpdate,
  IAffiliateCommissionRepository,
} from '../../domain/ports/affiliate-commission-repository.port';

type Row = Prisma.AffiliateCommissionGetPayload<Record<string, never>>;
type RowWithBooking = Prisma.AffiliateCommissionGetPayload<{ include: typeof WITH_BOOKING }>;

/**
 * Search / status / created-at filters for the affiliate's commission list. A
 * commission carries no code of its own, so the text search reaches into the
 * source booking's code + referral code (a to-one relation filter).
 */
function listWhere(
  affiliateId: string,
  filter: AffiliateCommissionListFilter,
): Prisma.AffiliateCommissionWhereInput {
  const where: Prisma.AffiliateCommissionWhereInput = { affiliateId };
  if (filter.q) {
    where.booking = {
      OR: [
        { code: { contains: filter.q, mode: 'insensitive' } },
        { referralCode: { contains: filter.q, mode: 'insensitive' } },
      ],
    };
  }
  if (filter.status) where.status = filter.status;
  if (filter.from || filter.to) {
    where.createdAt = {
      ...(filter.from ? { gte: new Date(filter.from) } : {}),
      ...(filter.to ? { lte: new Date(filter.to) } : {}),
    };
  }
  return where;
}

// A commission row is meaningless on its own: the affiliate needs to know which
// booking (code, listing, amount) earned it and what state that booking is in.
const WITH_BOOKING = {
  booking: {
    select: { code: true, status: true, finalAmount: true, listing: { select: { title: true } } },
  },
} as const;

function toState(c: Row): AffiliateCommissionState {
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

function toWithBooking(c: RowWithBooking): AffiliateCommissionWithBooking {
  return {
    ...toState(c),
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
export class PrismaAffiliateCommissionRepository
  implements IAffiliateCommissionRepository, IAffiliateCommissionReader
{
  async loadByBooking(
    tx: PrismaTx,
    bookingId: string,
  ): Promise<AffiliateCommissionState | null> {
    const c = await tx.affiliateCommission.findUnique({ where: { bookingId } });
    return c ? toState(c) : null;
  }

  async upsert(
    tx: PrismaTx,
    commission: NewAffiliateCommission,
  ): Promise<void> {
    await tx.affiliateCommission.upsert({
      where: { bookingId: commission.bookingId },
      create: {
        tenantId: commission.tenantId,
        affiliateId: commission.affiliateId,
        bookingId: commission.bookingId,
        amount: commission.amount,
        status: commission.status,
      },
      update: { amount: commission.amount, status: commission.status },
    });
  }

  async updateForBooking(
    tx: PrismaTx,
    bookingId: string,
    data: AffiliateCommissionUpdate,
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

  async listByAffiliatePaginated(
    tx: PrismaTx,
    affiliateId: string,
    params: AffiliateCommissionListFilter,
  ): Promise<RepoPage<AffiliateCommissionWithBooking>> {
    const where = listWhere(affiliateId, params);
    const { skip, take } = pageOffset(params);
    const [rows, total] = await Promise.all([
      tx.affiliateCommission.findMany({ where, include: WITH_BOOKING, orderBy: { createdAt: 'desc' }, skip, take }),
      tx.affiliateCommission.count({ where }),
    ]);
    return { items: rows.map(toWithBooking), total };
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
      where: {
        affiliateId,
        status: AFFILIATE_COMMISSION_PAID_SOURCE_STATUS,
      },
      data: { status: 'paid' },
    });
  }
}
