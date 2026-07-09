import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import type {
  CommissionRuleRecord,
  CreateCommissionRuleData,
  ICommissionRuleRepository,
  UpdateCommissionRuleData,
} from '../../domain/ports/commission-rule-repository.port';

type Row = Prisma.CommissionRuleGetPayload<Record<string, never>>;

function toRecord(r: Row): CommissionRuleRecord {
  return {
    id: r.id,
    tenantId: r.tenantId,
    appliesTo: r.appliesTo,
    listingTypeId: r.listingTypeId,
    categoryId: r.categoryId,
    partnerId: r.partnerId,
    tenantRateType: r.tenantRateType,
    tenantRate: r.tenantRate,
    platformRate: r.platformRate,
    affiliateRateType: r.affiliateRateType,
    affiliateRate: r.affiliateRate,
    effectiveFrom: r.effectiveFrom,
    effectiveTo: r.effectiveTo,
    createdAt: r.createdAt,
  };
}

@Injectable()
export class PrismaCommissionRuleRepository implements ICommissionRuleRepository {
  async list(tx: PrismaTx): Promise<CommissionRuleRecord[]> {
    const rows = await tx.commissionRule.findMany({ orderBy: { createdAt: 'desc' } });
    return rows.map(toRecord);
  }

  async findById(tx: PrismaTx, id: string): Promise<CommissionRuleRecord | null> {
    const r = await tx.commissionRule.findUnique({ where: { id } });
    return r ? toRecord(r) : null;
  }

  async create(tx: PrismaTx, tenantId: string, data: CreateCommissionRuleData): Promise<CommissionRuleRecord> {
    return toRecord(
      await tx.commissionRule.create({
        data: {
          tenantId,
          appliesTo: data.appliesTo,
          listingTypeId: data.listingTypeId,
          categoryId: data.categoryId,
          partnerId: data.partnerId,
          tenantRateType: data.tenantRateType,
          tenantRate: data.tenantRate,
          platformRate: data.platformRate,
          affiliateRateType: data.affiliateRateType,
          affiliateRate: data.affiliateRate,
          effectiveFrom: data.effectiveFrom,
          effectiveTo: data.effectiveTo,
        },
      }),
    );
  }

  async update(tx: PrismaTx, id: string, data: UpdateCommissionRuleData): Promise<CommissionRuleRecord> {
    return toRecord(
      await tx.commissionRule.update({
        where: { id },
        data: {
          appliesTo: data.appliesTo,
          listingTypeId: data.listingTypeId,
          categoryId: data.categoryId,
          partnerId: data.partnerId,
          tenantRateType: data.tenantRateType,
          tenantRate: data.tenantRate,
          affiliateRateType: data.affiliateRateType,
          affiliateRate: data.affiliateRate,
          effectiveFrom: data.effectiveFrom,
          effectiveTo: data.effectiveTo,
        },
      }),
    );
  }

  async setPlatformRate(tx: PrismaTx, id: string, platformRate: number): Promise<CommissionRuleRecord> {
    return toRecord(await tx.commissionRule.update({ where: { id }, data: { platformRate } }));
  }

  async delete(tx: PrismaTx, id: string): Promise<void> {
    await tx.commissionRule.delete({ where: { id } });
  }
}
