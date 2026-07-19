import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AdminReviewsQuery } from '@booking/contracts';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import type {
  AdminReviewPage,
  IAdminReviewReader,
} from '../../domain/ports/admin-review-reader.port';
import { REVIEW_INCLUDE, toReviewRecord } from './prisma-review.repository';

@Injectable()
export class PrismaAdminReviewReader implements IAdminReviewReader {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: AdminReviewsQuery): Promise<AdminReviewPage> {
    const where: Prisma.ReviewWhereInput = {
      ...(query.tenantId ? { tenantId: query.tenantId } : {}),
      ...(query.rating ? { rating: query.rating } : {}),
      ...(query.listingId ? { listingId: query.listingId } : {}),
      ...(query.responseStatus === 'pending'
        ? { reply: { is: null } }
        : query.responseStatus === 'responded'
          ? { reply: { isNot: null } }
          : {}),
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
              { tenant: { name: { contains: query.q, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
    const [rows, total, aggregate, unansweredCount, grouped] = await Promise.all([
      this.prisma.admin.review.findMany({
        where,
        include: { ...REVIEW_INCLUDE, tenant: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.admin.review.count({ where }),
      this.prisma.admin.review.aggregate({ where, _avg: { rating: true }, _count: true }),
      this.prisma.admin.review.count({ where: { AND: [where, { reply: { is: null } }] } }),
      this.prisma.admin.review.groupBy({ by: ['rating'], where, _count: true }),
    ]);
    const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } as Record<1 | 2 | 3 | 4 | 5, number>;
    for (const row of grouped) distribution[row.rating as 1 | 2 | 3 | 4 | 5] = row._count;
    return {
      items: rows.map((row) => ({
        ...toReviewRecord(row),
        tenantName: row.tenant.name,
      })),
      total,
      summary: {
        ratingAvg: aggregate._avg.rating,
        reviewCount: aggregate._count,
        unansweredCount,
        distribution,
      },
    };
  }
}
