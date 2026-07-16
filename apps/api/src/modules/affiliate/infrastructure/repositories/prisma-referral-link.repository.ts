import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import type {
  CreateReferralLinkData,
  IReferralLinkRepository,
  ReferralLinkRecord,
} from '../../domain/ports/referral-link-repository.port';

type Row = Prisma.ReferralLinkGetPayload<{ include: typeof WITH_LISTING }>;

// A listing-targeted link is unreadable as a bare uuid — join the title so every
// read of a link can name what it points at.
const WITH_LISTING = { listing: { select: { title: true } } } as const;

function toRecord(l: Row): ReferralLinkRecord {
  return {
    id: l.id,
    tenantId: l.tenantId,
    affiliateId: l.affiliateId,
    code: l.code,
    target: l.target,
    listingId: l.listingId,
    listingTitle: l.listing?.title ?? null,
    clicksCount: l.clicksCount,
    createdAt: l.createdAt,
  };
}

@Injectable()
export class PrismaReferralLinkRepository implements IReferralLinkRepository {
  async create(tx: PrismaTx, tenantId: string, data: CreateReferralLinkData): Promise<ReferralLinkRecord> {
    return toRecord(
      await tx.referralLink.create({
        data: {
          tenantId,
          affiliateId: data.affiliateId,
          code: data.code,
          target: data.target,
          listingId: data.listingId,
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

  async findById(tx: PrismaTx, id: string): Promise<ReferralLinkRecord | null> {
    const l = await tx.referralLink.findUnique({ where: { id }, include: WITH_LISTING });
    return l ? toRecord(l) : null;
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
    data: { referralLinkId: string; visitorId: string | null; ipHash: string | null; userAgent: string | null },
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
