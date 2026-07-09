import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import type {
  CreatePromotionData,
  IPromotionRepository,
  PromotionRecord,
  UpdatePromotionData,
} from '../../domain/ports/promotion-repository.port';

type Row = Prisma.PromotionGetPayload<Record<string, never>>;

function toRecord(p: Row): PromotionRecord {
  return {
    id: p.id,
    tenantId: p.tenantId,
    name: p.name,
    code: p.code,
    discountType: p.discountType,
    discountValue: p.discountValue,
    maxDiscount: p.maxDiscount,
    fundedBy: p.fundedBy,
    appliesTo: p.appliesTo,
    appliesToId: p.appliesToId,
    minOrderAmount: p.minOrderAmount,
    usageLimitTotal: p.usageLimitTotal,
    redeemedCount: p.redeemedCount,
    startsAt: p.startsAt,
    endsAt: p.endsAt,
    status: p.status,
    createdAt: p.createdAt,
  };
}

@Injectable()
export class PrismaPromotionRepository implements IPromotionRepository {
  async create(tx: PrismaTx, tenantId: string, data: CreatePromotionData): Promise<PromotionRecord> {
    return toRecord(
      await tx.promotion.create({
        data: {
          tenantId,
          name: data.name,
          code: data.code,
          discountType: data.discountType,
          discountValue: data.discountValue,
          maxDiscount: data.maxDiscount,
          appliesTo: data.appliesTo,
          appliesToId: data.appliesToId,
          minOrderAmount: data.minOrderAmount,
          usageLimitTotal: data.usageLimitTotal,
          startsAt: data.startsAt,
          endsAt: data.endsAt,
          status: data.status,
        },
      }),
    );
  }

  async update(tx: PrismaTx, id: string, data: UpdatePromotionData): Promise<PromotionRecord> {
    return toRecord(
      await tx.promotion.update({
        where: { id },
        data: {
          name: data.name,
          code: data.code,
          discountType: data.discountType,
          discountValue: data.discountValue,
          maxDiscount: data.maxDiscount,
          appliesTo: data.appliesTo,
          appliesToId: data.appliesToId,
          minOrderAmount: data.minOrderAmount,
          usageLimitTotal: data.usageLimitTotal,
          startsAt: data.startsAt,
          endsAt: data.endsAt,
          status: data.status,
        },
      }),
    );
  }

  async findById(tx: PrismaTx, id: string): Promise<PromotionRecord | null> {
    const p = await tx.promotion.findUnique({ where: { id } });
    return p ? toRecord(p) : null;
  }

  async findByCode(tx: PrismaTx, code: string): Promise<PromotionRecord | null> {
    // `code` is unique per tenant; RLS scopes the lookup to the current tenant.
    const p = await tx.promotion.findFirst({ where: { code } });
    return p ? toRecord(p) : null;
  }

  async list(tx: PrismaTx): Promise<PromotionRecord[]> {
    const rows = await tx.promotion.findMany({ orderBy: { createdAt: 'desc' } });
    return rows.map(toRecord);
  }

  async end(tx: PrismaTx, id: string): Promise<PromotionRecord> {
    return toRecord(await tx.promotion.update({ where: { id }, data: { status: 'ended' } }));
  }

  /**
   * Race-safe claim of the last available use (§12.3): a single conditional
   * UPDATE — the row lock serialises concurrent claimers, so exactly
   * `usage_limit_total` requests can ever succeed. 0 rows affected = sold out.
   */
  async claimUsage(tx: PrismaTx, id: string): Promise<boolean> {
    const affected = await tx.$executeRaw(Prisma.sql`
      UPDATE promotions
      SET redeemed_count = redeemed_count + 1, updated_at = now()
      WHERE id = ${id}::uuid
        AND status = 'active'
        AND (usage_limit_total IS NULL OR redeemed_count < usage_limit_total)`);
    return affected > 0;
  }

  async releaseUsage(tx: PrismaTx, id: string): Promise<void> {
    // Guard at 0 so a double-release can never drive the counter negative.
    await tx.$executeRaw(Prisma.sql`
      UPDATE promotions
      SET redeemed_count = redeemed_count - 1, updated_at = now()
      WHERE id = ${id}::uuid AND redeemed_count > 0`);
  }
}
