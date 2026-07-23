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
import type {
  EligibleBooking,
  NewReview,
  Review,
  ReviewState,
} from '../../domain/entities/review.entity';
import {
  ReviewAlreadyExists,
  ReviewReplyAlreadyExists,
  ReviewReplyNotAccepted,
} from '../../domain/errors/review-errors';

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
    media: parseReviewMedia(row.media),
    reply: row.reply
      ? {
          id: row.reply.id,
          content: row.reply.content,
          partnerName: row.reply.partner.name,
          createdAt: row.reply.createdAt,
        }
      : null,
    serviceCompletedAt: row.booking.settlement?.completedAt ?? null,
    bookingStartsAt: null,
    bookingEndsAt: null,
    createdAt: row.createdAt,
  };
}

function parseReviewMedia(value: Prisma.JsonValue): ReviewRecord['media'] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const kind = 'kind' in item ? item.kind : null;
    const key = 'key' in item ? item.key : null;
    const url = 'url' in item ? item.url : null;
    return (kind === 'image' || kind === 'video') && typeof key === 'string' && typeof url === 'string'
      ? [{ kind, key, url }]
      : [];
  });
}

interface BookingTimeRow {
  id: string;
  startsAt: Date | null;
  endsAt: Date | null;
}

async function bookingTimes(
  tx: PrismaTx,
  bookingIds: string[],
): Promise<Map<string, BookingTimeRow>> {
  if (bookingIds.length === 0) return new Map();
  const bookingIdValues = Prisma.join(bookingIds.map((id) => Prisma.sql`${id}::uuid`));
  const rows = await tx.$queryRaw<BookingTimeRow[]>(Prisma.sql`
    SELECT id, lower(timeslot) AS "startsAt", upper(timeslot) AS "endsAt"
    FROM bookings
    WHERE id IN (${bookingIdValues})
  `);
  return new Map(rows.map((row) => [row.id, row]));
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
  async isReviewableBooking(
    tx: PrismaTx,
    customerId: string,
    bookingId: string,
  ): Promise<boolean> {
    const booking = await tx.booking.findFirst({
      where: { id: bookingId, customerId, status: 'completed', review: null },
      select: { id: true },
    });
    return Boolean(booking);
  }

  async findEligibleBooking(
    tx: PrismaTx,
    customerId: string,
    bookingId: string,
  ): Promise<EligibleBooking | null> {
    const booking = await tx.booking.findFirst({
      where: { id: bookingId, customerId, status: 'completed', review: null },
      select: {
        id: true,
        listingId: true,
        partnerId: true,
        listing: { select: { groupId: true } },
      },
    });
    if (!booking) return null;
    return {
      id: booking.id,
      listingId: booking.listingId,
      groupId: booking.listing.groupId,
      partnerId: booking.partnerId,
    };
  }

  async insert(
    tx: PrismaTx,
    tenantId: string,
    review: NewReview,
    media: ReviewRecord['media'],
  ): Promise<ReviewRecord> {
    try {
      const row = await tx.review.create({
        data: {
          tenantId,
          bookingId: review.bookingId,
          listingId: review.listingId,
          groupId: review.groupId,
          partnerId: review.partnerId,
          customerId: review.customerId,
          rating: review.rating,
          content: review.content,
          media: media as unknown as Prisma.InputJsonValue,
        },
        include: REVIEW_INCLUDE,
      });
      return toReviewRecord(row);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ReviewAlreadyExists();
      }
      throw error;
    }
  }

  async loadForReply(tx: PrismaTx, reviewId: string): Promise<ReviewState | null> {
    return tx.review.findUnique({
      where: { id: reviewId },
      select: {
        id: true,
        bookingId: true,
        partnerId: true,
        reply: { select: { partnerId: true } },
      },
    });
  }

  async saveReply(tx: PrismaTx, tenantId: string, review: Review): Promise<ReviewRecord> {
    const pending = review.reply();
    // Defensive: the use-case always calls addReply() first; a null here is a programming error.
    if (!pending) throw new ReviewReplyNotAccepted();
    try {
      await tx.reviewReply.create({
        data: {
          tenantId,
          reviewId: review.id,
          partnerId: pending.partnerId,
          authorUserId: pending.authorUserId,
          content: pending.content,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ReviewReplyAlreadyExists();
      }
      throw error;
    }
    const row = await tx.review.findUnique({ where: { id: review.id }, include: REVIEW_INCLUDE });
    // Unreachable: the review row exists in this tx (we just appended its reply).
    if (!row) throw new ReviewReplyNotAccepted();
    return toReviewRecord(row);
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
    const times = await bookingTimes(tx, [
      ...reviewRows.map((row) => row.bookingId),
      ...pendingRows.map((row) => row.id),
    ]);
    const reviewed = reviewRows.map((row) => {
      const time = times.get(row.bookingId);
      return {
        ...toReviewRecord(row),
        status: 'reviewed' as const,
        bookingStartsAt: time?.startsAt ?? null,
        bookingEndsAt: time?.endsAt ?? null,
      };
    });
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
        bookingStartsAt: times.get(row.id)?.startsAt ?? null,
        bookingEndsAt: times.get(row.id)?.endsAt ?? null,
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
