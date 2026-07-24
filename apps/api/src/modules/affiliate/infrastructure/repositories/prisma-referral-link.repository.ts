import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { pageOffset } from '../../../../shared/pagination/pagination';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import type {
  NewReferralLink,
  ReferralLinkState,
} from '../../domain/entities/referral-link.entity';
import type {
  IReferralLinkReader,
  ReferralLinkListFilter,
  ReferralLinkRecord,
} from '../../domain/ports/referral-link-reader.port';
import type {
  IReferralLinkRepository,
  ReferralClickData,
} from '../../domain/ports/referral-link-repository.port';

type Row = Prisma.ReferralLinkGetPayload<Record<string, never>>;
type RowWithListing = Prisma.ReferralLinkGetPayload<{
  include: typeof WITH_LISTING;
}>;

// A listing-targeted link is unreadable as a bare uuid — join the title so every
// read of a link can name what it points at.
const WITH_LISTING = { listing: { select: { title: true } } } as const;

/**
 * Search filter for the affiliate's referral-link list. A link has no label
 * column of its own; its human-readable name is the targeted listing's title,
 * so the text search covers the code + that listing title (a relation filter).
 */
function listWhere(affiliateId: string, filter: ReferralLinkListFilter): Prisma.ReferralLinkWhereInput {
  const where: Prisma.ReferralLinkWhereInput = { affiliateId };
  if (filter.q) {
    where.OR = [
      { code: { contains: filter.q, mode: 'insensitive' } },
      { listing: { title: { contains: filter.q, mode: 'insensitive' } } },
    ];
  }
  return where;
}

function toState(l: Row): ReferralLinkState {
  return {
    id: l.id,
    tenantId: l.tenantId,
    affiliateId: l.affiliateId,
    code: l.code,
    target: l.target,
    listingId: l.listingId,
    clicksCount: l.clicksCount,
    createdAt: l.createdAt,
  };
}

function toRecord(l: RowWithListing): ReferralLinkRecord {
  return {
    ...toState(l),
    listingTitle: l.listing?.title ?? null,
  };
}

@Injectable()
export class PrismaReferralLinkRepository
  implements IReferralLinkRepository, IReferralLinkReader
{
  async create(
    tx: PrismaTx,
    link: NewReferralLink,
  ): Promise<ReferralLinkRecord> {
    return toRecord(
      await tx.referralLink.create({
        data: {
          tenantId: link.tenantId,
          affiliateId: link.affiliateId,
          code: link.code,
          target: link.target,
          listingId: link.listingId,
        },
        include: WITH_LISTING,
      }),
    );
  }

  async findByCode(tx: PrismaTx, code: string): Promise<ReferralLinkRecord | null> {
    // `(tenant_id, code)` is unique; RLS scopes the lookup to the current tenant.
    const l = await tx.referralLink.findFirst({ where: { code }, include: WITH_LISTING });
    return l ? toRecord(l) : null;
  }

  async listByAffiliate(tx: PrismaTx, affiliateId: string): Promise<ReferralLinkRecord[]> {
    const rows = await tx.referralLink.findMany({
      where: { affiliateId },
      include: WITH_LISTING,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toRecord);
  }

  async listByAffiliatePaginated(
    tx: PrismaTx,
    affiliateId: string,
    params: ReferralLinkListFilter,
  ): Promise<{ items: ReferralLinkRecord[]; total: number }> {
    const where = listWhere(affiliateId, params);
    const { skip, take } = pageOffset(params);
    const [rows, total] = await Promise.all([
      tx.referralLink.findMany({ where, include: WITH_LISTING, orderBy: { createdAt: 'desc' }, skip, take }),
      tx.referralLink.count({ where }),
    ]);
    return { items: rows.map(toRecord), total };
  }

  async loadById(
    tx: PrismaTx,
    id: string,
  ): Promise<ReferralLinkState | null> {
    const link = await tx.referralLink.findUnique({ where: { id } });
    return link ? toState(link) : null;
  }

  async delete(tx: PrismaTx, id: string): Promise<void> {
    await tx.referralLink.delete({ where: { id } });
  }

  async incrementClicks(tx: PrismaTx, id: string): Promise<void> {
    await tx.referralLink.update({ where: { id }, data: { clicksCount: { increment: 1 } } });
  }

  async recordClick(
    tx: PrismaTx,
    tenantId: string,
    data: ReferralClickData,
  ): Promise<void> {
    await tx.referralClick.create({
      data: {
        tenantId,
        referralLinkId: data.referralLinkId,
        visitorId: data.visitorId,
        ipHash: data.ipHash,
        userAgent: data.userAgent,
      },
    });
  }

  async totalClicksForAffiliate(tx: PrismaTx, affiliateId: string): Promise<number> {
    const agg = await tx.referralLink.aggregate({ where: { affiliateId }, _sum: { clicksCount: true } });
    return agg._sum.clicksCount ?? 0;
  }

  async countByAffiliate(tx: PrismaTx, affiliateId: string): Promise<number> {
    return tx.referralLink.count({ where: { affiliateId } });
  }
}
