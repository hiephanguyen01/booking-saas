import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import type {
  CommissionCoverageRule,
  CommissionCoverageTarget,
  ICommissionCoverageReader,
} from '../../domain/ports/commission-coverage-reader.port';

@Injectable()
export class PrismaCommissionCoverageReader implements ICommissionCoverageReader {
  async findEffectiveRule(
    tx: PrismaTx,
    target: CommissionCoverageTarget,
  ): Promise<CommissionCoverageRule | null> {
    const rows = await tx.$queryRaw<
      Array<{ id: string; rateType: 'percent' | 'fixed'; rate: bigint }>
    >(Prisma.sql`
      SELECT id, tenant_rate_type::text AS "rateType", tenant_rate AS rate
      FROM commission_rules
      WHERE (effective_from IS NULL OR effective_from <= now())
        AND (effective_to IS NULL OR effective_to > now())
        AND (
          (applies_to = 'partner' AND partner_id = ${target.partnerId}::uuid)
          OR (applies_to = 'category' AND category_id = ${target.categoryId}::uuid)
          OR (applies_to = 'listing_type' AND listing_type_id = ${target.listingTypeId}::uuid)
          OR applies_to = 'tenant_default'
        )
      ORDER BY CASE applies_to
        WHEN 'partner' THEN 3
        WHEN 'category' THEN 2
        WHEN 'listing_type' THEN 2
        ELSE 1
      END DESC,
      COALESCE(effective_from, '-infinity'::timestamptz) DESC,
      created_at DESC
      LIMIT 1`);
    return rows[0] ?? null;
  }
}
