import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import type {
  CreateRedemptionData,
  IPromoRedemptionRepository,
  RedemptionUsageStats,
} from '../../domain/ports/promo-redemption-repository.port';

@Injectable()
export class PrismaPromoRedemptionRepository implements IPromoRedemptionRepository {
  async reserve(tx: PrismaTx, tenantId: string, data: CreateRedemptionData): Promise<void> {
    await tx.promoRedemption.create({
      data: {
        tenantId,
        promotionId: data.promotionId,
        bookingId: data.bookingId,
        customerId: data.customerId,
        discountAmount: data.discountAmount,
        status: 'reserved',
      },
    });
  }

  /** `reserved → applied` — idempotent (a redelivered booking.confirmed is a no-op). */
  async markApplied(tx: PrismaTx, bookingId: string): Promise<boolean> {
    const affected = await tx.$executeRaw(Prisma.sql`
      UPDATE promo_redemptions
      SET status = 'applied', updated_at = now()
      WHERE booking_id = ${bookingId}::uuid AND status = 'reserved'`);
    return affected > 0;
  }

  /**
   * `reserved|applied → released` — idempotent: only the first delivery flips a
   * row, so the paired usage decrement runs exactly once. Returns the promotion
   * id whose usage must be returned, or null if nothing changed.
   */
  async release(tx: PrismaTx, bookingId: string): Promise<string | null> {
    const rows = await tx.$queryRaw<{ promotion_id: string }[]>(Prisma.sql`
      UPDATE promo_redemptions
      SET status = 'released', updated_at = now()
      WHERE booking_id = ${bookingId}::uuid AND status IN ('reserved', 'applied')
      RETURNING promotion_id`);
    return rows[0]?.promotion_id ?? null;
  }

  async usageStats(tx: PrismaTx, promotionId: string): Promise<RedemptionUsageStats> {
    const rows = await tx.$queryRaw<
      { reserved: bigint; applied: bigint; released: bigint; total_discount: bigint }[]
    >(Prisma.sql`
      SELECT
        COUNT(*) FILTER (WHERE status = 'reserved') AS reserved,
        COUNT(*) FILTER (WHERE status = 'applied')  AS applied,
        COUNT(*) FILTER (WHERE status = 'released') AS released,
        COALESCE(SUM(discount_amount) FILTER (WHERE status <> 'released'), 0) AS total_discount
      FROM promo_redemptions
      WHERE promotion_id = ${promotionId}::uuid`);
    const r = rows[0];
    return {
      reservedCount: Number(r?.reserved ?? 0n),
      appliedCount: Number(r?.applied ?? 0n),
      releasedCount: Number(r?.released ?? 0n),
      totalDiscount: r?.total_discount ?? 0n,
    };
  }

  async countActiveByCustomer(tx: PrismaTx, promotionId: string, customerId: string): Promise<number> {
    return tx.promoRedemption.count({
      where: { promotionId, customerId, status: { not: 'released' } },
    });
  }
}
