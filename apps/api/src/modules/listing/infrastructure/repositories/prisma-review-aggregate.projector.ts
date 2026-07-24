import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import type { IReviewAggregateProjector } from '../../domain/ports/review-aggregate-projector.port';

@Injectable()
export class PrismaReviewAggregateProjector implements IReviewAggregateProjector {
  async project(
    tx: PrismaTx,
    listingId: string,
    groupId: string | null,
  ): Promise<void> {
    await tx.$executeRaw(Prisma.sql`
      UPDATE listings l
      SET
        rating_avg = stats.rating_avg,
        review_count = stats.review_count,
        updated_at = now()
      FROM (
        SELECT
          ROUND(AVG(rating)::numeric, 2) AS rating_avg,
          COUNT(*)::integer AS review_count
        FROM reviews
        WHERE listing_id = ${listingId}::uuid
      ) stats
      WHERE l.id = ${listingId}::uuid
    `);

    if (!groupId) return;
    await tx.$executeRaw(Prisma.sql`
      UPDATE listing_groups g
      SET
        rating_avg = stats.rating_avg,
        review_count = stats.review_count,
        updated_at = now()
      FROM (
        SELECT
          ROUND(AVG(rating)::numeric, 2) AS rating_avg,
          COUNT(*)::integer AS review_count
        FROM reviews
        WHERE group_id = ${groupId}::uuid
      ) stats
      WHERE g.id = ${groupId}::uuid
    `);
  }
}
