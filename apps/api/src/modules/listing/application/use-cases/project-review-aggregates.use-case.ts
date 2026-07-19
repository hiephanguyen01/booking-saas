import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';

@Injectable()
export class ProjectReviewAggregatesUseCase {
  constructor(private readonly tenantDb: TenantDbService) {}

  async execute(
    tenantId: string,
    payload: { listingId?: string; groupId?: string | null },
  ): Promise<void> {
    if (!payload.listingId) return;
    await this.tenantDb.forTenant(tenantId, async (tx) => {
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
          WHERE listing_id = ${payload.listingId}::uuid
        ) stats
        WHERE l.id = ${payload.listingId}::uuid
      `);

      if (payload.groupId) {
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
            WHERE group_id = ${payload.groupId}::uuid
          ) stats
          WHERE g.id = ${payload.groupId}::uuid
        `);
      }
    });
  }
}
