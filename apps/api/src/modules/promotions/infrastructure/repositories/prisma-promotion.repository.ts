import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import type { PromoTimeWindow } from '../../domain/promotion-discount';
import type {
  CreatePromotionData,
  IPromotionRepository,
  PromotionRecord,
  UpdatePromotionData,
} from '../../domain/ports/promotion-repository.port';

type Row = Prisma.PromotionGetPayload<Record<string, never>>;

function parseTimeWindows(value: Prisma.JsonValue | null): PromoTimeWindow[] | null {
  if (value === null || !Array.isArray(value)) return null;
  return value as unknown as PromoTimeWindow[];
}

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
    firstBookingOnly: p.firstBookingOnly,
    usageLimitTotal: p.usageLimitTotal,
    usageLimitPerCustomer: p.usageLimitPerCustomer,
    timeWindows: parseTimeWindows(p.timeWindows),
    redeemedCount: p.redeemedCount,
    startsAt: p.startsAt,
    endsAt: p.endsAt,
    status: p.status,
    createdByPartnerId: p.createdByPartnerId,
    fundingPartnerId: p.fundingPartnerId,
    partnerOptInAt: p.partnerOptInAt,
    createdAt: p.createdAt,
  };
}

/** Prisma write payload shared by create/update — `timeWindows` serialised to JSON. */
function toWriteData(data: UpdatePromotionData): Omit<Prisma.PromotionUncheckedUpdateInput, 'tenantId' | 'id'> {
  return {
    name: data.name,
    code: data.code,
    discountType: data.discountType,
    discountValue: data.discountValue,
    maxDiscount: data.maxDiscount,
    fundedBy: data.fundedBy,
    appliesTo: data.appliesTo,
    appliesToId: data.appliesToId,
    minOrderAmount: data.minOrderAmount,
    firstBookingOnly: data.firstBookingOnly,
    usageLimitTotal: data.usageLimitTotal,
    usageLimitPerCustomer: data.usageLimitPerCustomer,
    timeWindows:
      data.timeWindows === undefined
        ? undefined
        : data.timeWindows === null
          ? Prisma.DbNull
          : (data.timeWindows as unknown as Prisma.InputJsonValue),
    startsAt: data.startsAt,
    endsAt: data.endsAt,
    status: data.status,
    createdByPartnerId: data.createdByPartnerId,
    fundingPartnerId: data.fundingPartnerId,
    partnerOptInAt: data.partnerOptInAt,
  };
}

@Injectable()
export class PrismaPromotionRepository implements IPromotionRepository {
  async create(tx: PrismaTx, tenantId: string, data: CreatePromotionData): Promise<PromotionRecord> {
    return toRecord(
      await tx.promotion.create({
        data: { tenantId, ...toWriteData(data) } as Prisma.PromotionUncheckedCreateInput,
      }),
    );
  }

  async update(tx: PrismaTx, id: string, data: UpdatePromotionData): Promise<PromotionRecord> {
    return toRecord(await tx.promotion.update({ where: { id }, data: toWriteData(data) }));
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

  async listByPartner(tx: PrismaTx, partnerId: string): Promise<PromotionRecord[]> {
    const rows = await tx.promotion.findMany({
      where: { createdByPartnerId: partnerId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toRecord);
  }

  async listActiveAutoCampaigns(tx: PrismaTx): Promise<PromotionRecord[]> {
    const rows = await tx.promotion.findMany({
      where: { code: null, status: 'active' },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toRecord);
  }

  async listPendingOptIn(tx: PrismaTx, partnerId: string): Promise<PromotionRecord[]> {
    const rows = await tx.promotion.findMany({
      where: { fundedBy: 'partner', fundingPartnerId: partnerId, partnerOptInAt: null, createdByPartnerId: null },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toRecord);
  }

  async end(tx: PrismaTx, id: string): Promise<PromotionRecord> {
    return toRecord(await tx.promotion.update({ where: { id }, data: { status: 'ended' } }));
  }

  async setPartnerOptIn(tx: PrismaTx, id: string, at: Date): Promise<PromotionRecord> {
    return toRecord(await tx.promotion.update({ where: { id }, data: { partnerOptInAt: at } }));
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
