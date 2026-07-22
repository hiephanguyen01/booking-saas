import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  CustomerReviewsQuery,
  PartnerReviewsQuery,
  PublicReviewsQuery,
  TenantReviewsQuery,
} from '@booking/contracts';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import type {
  CustomerReviewPage,
  IReviewRepository,
  PendingReviewRecord,
  ReviewPage,
  ReviewRecord,
  ReviewSummaryRecord,
} from '../../domain/ports/review-repository.port';

export const REVIEW_INCLUDE = Prisma.validator<Prisma.ReviewInclude>()({
  booking: { select: { code: true, settlement: { select: { completedAt: true } } } },
  listing: { select: { title: true, slug: true, photos: true } },
  group: { select: { title: true, slug: true } },
  partner: { select: { name: true } },
  customer: { select: { fullName: true } },
  reply: {
    include: { partner: { select: { name: true } } },
  },
});

type Row = Prisma.ReviewGetPayload<{ include: typeof REVIEW_INCLUDE }>;

export function toReviewRecord(row: Row): ReviewRecord {
  const photos = Array.isArray(row.listing.photos)
    ? row.listing.photos.filter((item): item is string => typeof item === 'string')
    : [];
  return {
    id: row.id,
    tenantId: row.tenantId,
    bookingId: row.bookingId,
    bookingCode: row.booking.code,
    listingId: row.listingId,
    listingTitle: row.listing.title,
    listingSlug: row.listing.slug,
    listingImageUrl: photos[0] ?? null,
    groupId: row.groupId,
    groupTitle: row.group?.title ?? null,
    groupSlug: row.group?.slug ?? null,
    partnerId: row.partnerId,
    partnerName: row.partner.name,
    customerName: row.customer.fullName,
    rating: row.rating,
    content: row.content,
    reply: row.reply
      ? {
          id: row.reply.id,
          content: row.reply.content,
          partnerName: row.reply.partner.name,
          createdAt: row.reply.createdAt,
        }
      : null,
    serviceCompletedAt: row.booking.settlement?.completedAt ?? null,
    createdAt: row.createdAt,
  };
}

function reviewWhere(
  query: PartnerReviewsQuery | TenantReviewsQuery,
  extra: Prisma.ReviewWhereInput = {},
): Prisma.ReviewWhereInput {
  const responseWhere =
    query.responseStatus === 'pending'
      ? { reply: { is: null } }
      : query.responseStatus === 'responded'
        ? { reply: { isNot: null } }
        : {};
  return {
    ...extra,
    ...responseWhere,
    ...(query.rating ? { rating: query.rating } : {}),
    ...(query.listingId ? { listingId: query.listingId } : {}),
    ...(query.from || query.to
      ? {
          createdAt: {
            ...(query.from ? { gte: new Date(query.from) } : {}),
            ...(query.to ? { lte: new Date(query.to) } : {}),
          },
        }
      : {}),
    ...(query.q
      ? {
          OR: [
            { content: { contains: query.q, mode: 'insensitive' } },
            { booking: { code: { contains: query.q, mode: 'insensitive' } } },
            { listing: { title: { contains: query.q, mode: 'insensitive' } } },
            { customer: { fullName: { contains: query.q, mode: 'insensitive' } } },
          ],
        }
      : {}),
  };
}

async function summary(tx: PrismaTx, where: Prisma.ReviewWhereInput): Promise<ReviewSummaryRecord> {
  const [aggregate, unansweredCount, grouped] = await Promise.all([
    tx.review.aggregate({ where, _avg: { rating: true }, _count: true }),
    tx.review.count({ where: { AND: [where, { reply: { is: null } }] } }),
    tx.review.groupBy({ by: ['rating'], where, _count: true }),
  ]);
  const distribution: ReviewSummaryRecord['distribution'] = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const row of grouped) distribution[row.rating as 1 | 2 | 3 | 4 | 5] = row._count;
  return {
    ratingAvg: aggregate._avg.rating,
    reviewCount: aggregate._count,
    unansweredCount,
    distribution,
  };
}

async function listPage(
  tx: PrismaTx,
  where: Prisma.ReviewWhereInput,
  page: number,
  pageSize: number,
  orderBy: Prisma.ReviewOrderByWithRelationInput = { createdAt: 'desc' },
): Promise<ReviewPage> {
  const [rows, total, aggregate] = await Promise.all([
    tx.review.findMany({
      where,
      include: REVIEW_INCLUDE,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    tx.review.count({ where }),
    summary(tx, where),
  ]);
  return { items: rows.map(toReviewRecord), total, summary: aggregate };
}

@Injectable()
export class PrismaReviewRepository implements IReviewRepository {
  async create(
    tx: PrismaTx,
    tenantId: string,
    customerId: string,
    data: { bookingId: string; rating: number; content: string },
  ): Promise<ReviewRecord | null> {
    const booking = await tx.booking.findFirst({
      where: { id: data.bookingId, customerId, status: 'completed', review: null },
      select: {
        id: true,
        listingId: true,
        partnerId: true,
        listing: { select: { groupId: true } },
      },
    });
    if (!booking) return null;
    const row = await tx.review.create({
      data: {
        tenantId,
        bookingId: booking.id,
        listingId: booking.listingId,
        groupId: booking.listing.groupId,
        partnerId: booking.partnerId,
        customerId,
        rating: data.rating,
        content: data.content,
      },
      include: REVIEW_INCLUDE,
    });
    return toReviewRecord(row);
  }

  async reply(
    tx: PrismaTx,
    tenantId: string,
    reviewId: string,
    partnerId: string,
    authorUserId: string,
    content: string,
  ): Promise<ReviewRecord | null> {
    const review = await tx.review.findFirst({ where: { id: reviewId, partnerId, reply: null } });
    if (!review) return null;
    await tx.reviewReply.create({
      data: { tenantId, reviewId, partnerId, authorUserId, content },
    });
    const row = await tx.review.findUnique({ where: { id: reviewId }, include: REVIEW_INCLUDE });
    return row ? toReviewRecord(row) : null;
  }

  async listCustomer(
    tx: PrismaTx,
    customerId: string,
    query: CustomerReviewsQuery,
  ): Promise<CustomerReviewPage> {
    const [reviewRows, pendingRows] = await Promise.all([
      query.status === 'pending'
        ? Promise.resolve([] as Row[])
        : tx.review.findMany({
            where: { customerId },
            include: REVIEW_INCLUDE,
            orderBy: { createdAt: 'desc' },
          }),
      query.status === 'reviewed'
        ? Promise.resolve([])
        : tx.booking.findMany({
            where: { customerId, status: 'completed', review: null },
            select: {
              id: true,
              code: true,
              listingId: true,
              listing: {
                select: {
                  title: true,
                  slug: true,
                  photos: true,
                  group: { select: { title: true } },
                },
              },
              partner: { select: { name: true } },
              settlement: { select: { completedAt: true } },
              updatedAt: true,
            },
            orderBy: { updatedAt: 'desc' },
          }),
    ]);
    const reviewed = reviewRows.map((row) => ({
      ...toReviewRecord(row),
      status: 'reviewed' as const,
    }));
    const pending: PendingReviewRecord[] = pendingRows.map((row) => {
      const photos = Array.isArray(row.listing.photos)
        ? row.listing.photos.filter((item): item is string => typeof item === 'string')
        : [];
      return {
        status: 'pending',
        bookingId: row.id,
        bookingCode: row.code,
        listingId: row.listingId,
        listingTitle: row.listing.title,
        listingSlug: row.listing.slug,
        listingImageUrl: photos[0] ?? null,
        groupTitle: row.listing.group?.title ?? null,
        partnerName: row.partner.name,
        serviceCompletedAt: row.settlement?.completedAt ?? row.updatedAt,
      };
    });
    const combined = [...pending, ...reviewed].sort((a, b) => {
      const aTime = a.status === 'pending' ? a.serviceCompletedAt : a.createdAt;
      const bTime = b.status === 'pending' ? b.serviceCompletedAt : b.createdAt;
      return (bTime?.getTime() ?? 0) - (aTime?.getTime() ?? 0);
    });
    const start = (query.page - 1) * query.pageSize;
    return { items: combined.slice(start, start + query.pageSize), total: combined.length };
  }

  async listPublic(tx: PrismaTx, query: PublicReviewsQuery): Promise<ReviewPage | null> {
    let targetWhere: Prisma.ReviewWhereInput;
    if (query.target === 'listing') {
      const listing = await tx.listing.findFirst({
        where: { slug: query.slug, status: 'published' },
        select: { id: true },
      });
      if (!listing) return null;
      targetWhere = { listingId: listing.id };
    } else if (query.target === 'group') {
      const group = await tx.listingGroup.findFirst({
        where: { slug: query.slug, status: 'published' },
        select: { id: true },
      });
      if (!group) return null;
      targetWhere = { groupId: group.id };
    } else {
      const partner = await tx.partner.findFirst({
        where: {
          slug: query.slug,
          status: 'approved',
          OR: [
            { listings: { some: { status: 'published' } } },
            { listingGroups: { some: { status: 'published' } } },
          ],
        },
        select: { id: true },
      });
      if (!partner) return null;
      targetWhere = { partnerId: partner.id };
    }
    const where = { ...targetWhere, ...(query.rating ? { rating: query.rating } : {}) };
    const orderBy =
      query.sort === 'highest'
        ? { rating: 'desc' as const }
        : query.sort === 'lowest'
          ? { rating: 'asc' as const }
          : { createdAt: 'desc' as const };
    return listPage(tx, where, query.page, query.pageSize, orderBy);
  }

  listPartner(tx: PrismaTx, partnerId: string, query: PartnerReviewsQuery): Promise<ReviewPage> {
    return listPage(tx, reviewWhere(query, { partnerId }), query.page, query.pageSize);
  }

  listTenant(tx: PrismaTx, query: TenantReviewsQuery): Promise<ReviewPage> {
    const extra = query.partnerId ? { partnerId: query.partnerId } : {};
    return listPage(tx, reviewWhere(query, extra), query.page, query.pageSize);
  }
}
