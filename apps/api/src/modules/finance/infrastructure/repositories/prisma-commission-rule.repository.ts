import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import type {
  CommissionRuleRecord,
  CreateCommissionRuleData,
  ICommissionRuleRepository,
  IncompatibleDepositCoverage,
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

  async findIncompatibleListingsForRule(
    tx: PrismaTx,
    data: CreateCommissionRuleData,
    excludeRuleId?: string,
  ): Promise<IncompatibleDepositCoverage> {
    const rows = await tx.$queryRaw<
      Array<{
        id: string;
        title: string;
        depositPercent: number;
        requiredPercent: bigint;
        total: bigint;
      }>
    >(Prisma.sql`
      WITH rule_pool AS (
        SELECT id, applies_to, listing_type_id, category_id, partner_id,
               tenant_rate_type, tenant_rate, effective_from, effective_to,
               created_at, false AS proposed
        FROM commission_rules
        WHERE (${excludeRuleId ?? null}::uuid IS NULL OR id <> ${excludeRuleId ?? null}::uuid)
        UNION ALL
        SELECT gen_random_uuid(), ${data.appliesTo}::commission_applies_to,
               ${data.listingTypeId}::uuid, ${data.categoryId}::uuid, ${data.partnerId}::uuid,
               ${data.tenantRateType}::rate_type, ${data.tenantRate},
               ${data.effectiveFrom}, ${data.effectiveTo}, now(), true
      ), check_points AS (
        -- The winner can only change at now(), an effective_from, or an
        -- effective_to boundary. Evaluating every future boundary proves the
        -- deposit invariant over the complete proposed timeline, not just today.
        SELECT now() AS checked_at
        UNION
        SELECT effective_from FROM rule_pool WHERE effective_from >= now()
        UNION
        SELECT effective_to FROM rule_pool WHERE effective_to >= now()
      ), resolved AS (
        SELECT l.id, l.title, l.deposit_percent,
          effective.tenant_rate_type, effective.tenant_rate
        FROM listings l
        JOIN partners p ON p.id = l.partner_id AND p.is_house = false
        CROSS JOIN check_points cp
        LEFT JOIN LATERAL (
          SELECT cr.tenant_rate_type, cr.tenant_rate
          FROM rule_pool cr
          WHERE (cr.effective_from IS NULL OR cr.effective_from <= cp.checked_at)
            AND (cr.effective_to IS NULL OR cr.effective_to > cp.checked_at)
            AND (
              (cr.applies_to = 'partner' AND cr.partner_id = l.partner_id)
              OR (cr.applies_to = 'category' AND cr.category_id = l.category_id)
              OR (cr.applies_to = 'listing_type' AND cr.listing_type_id = l.listing_type_id)
              OR cr.applies_to = 'tenant_default'
            )
          ORDER BY CASE cr.applies_to
            WHEN 'partner' THEN 3
            WHEN 'category' THEN 2
            WHEN 'listing_type' THEN 2
            ELSE 1
          END DESC,
          COALESCE(cr.effective_from, '-infinity'::timestamptz) DESC,
          cr.proposed DESC,
          cr.created_at DESC
          LIMIT 1
        ) effective ON true
      ), incompatible_listings AS (
        SELECT id, title, deposit_percent, MAX(tenant_rate) AS tenant_rate
        FROM resolved
        WHERE tenant_rate_type = 'percent' AND deposit_percent < tenant_rate
        GROUP BY id, title, deposit_percent
      ), incompatible AS (
        SELECT id, title, deposit_percent, tenant_rate,
               COUNT(*) OVER ()::bigint AS total
        FROM incompatible_listings
      )
      SELECT id, title, deposit_percent AS "depositPercent",
             tenant_rate AS "requiredPercent", total
      FROM incompatible
      ORDER BY title, id
      LIMIT 10`);
    return {
      count: Number(rows[0]?.total ?? 0n),
      samples: rows.map((row) => ({
        id: row.id,
        title: row.title,
        depositPercent: row.depositPercent,
        requiredPercent: Number(row.requiredPercent),
      })),
    };
  }

  async create(
    tx: PrismaTx,
    tenantId: string,
    data: CreateCommissionRuleData,
  ): Promise<CommissionRuleRecord> {
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

  async update(
    tx: PrismaTx,
    id: string,
    data: UpdateCommissionRuleData,
  ): Promise<CommissionRuleRecord> {
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

  async setPlatformRate(
    tx: PrismaTx,
    id: string,
    platformRate: number,
  ): Promise<CommissionRuleRecord> {
    return toRecord(await tx.commissionRule.update({ where: { id }, data: { platformRate } }));
  }

  async delete(tx: PrismaTx, id: string): Promise<void> {
    await tx.commissionRule.delete({ where: { id } });
  }
}
