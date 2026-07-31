import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import type { RuleType } from '../../../../shared/domain/pricing/quote-calculator';
import type {
  IPricingRuleRepository,
  PricingRuleDateWindow,
  PricingRuleRecord,
} from '../../domain/ports/pricing-rule-repository.port';
import type { NewPricingRule } from '../../domain/entities/pricing-rule.entity';

type Row = Prisma.PricingRuleGetPayload<Record<string, never>>;

function toRecord(p: Row): PricingRuleRecord {
  return {
    id: p.id,
    tenantId: p.tenantId,
    listingId: p.listingId,
    bookingMode: p.bookingMode,
    ruleType: p.ruleType as RuleType,
    params: (p.params ?? {}) as Record<string, unknown>,
    price: p.price.toString(),
    salePrice: p.salePrice?.toString() ?? null,
    priority: p.priority,
    createdAt: p.createdAt,
  };
}

/**
 * `OR` branches selecting the rules that can price a date inside `window`.
 *
 * `params` is jsonb and the date fields are `YYYY-MM-DD`, whose lexicographic
 * order is its chronological order — so Postgres' jsonb string comparison is a
 * correct date comparison here, and only here. A `date_range` qualifies when it
 * overlaps the window (starts on/before the end AND ends on/after the start),
 * not when it is contained in it.
 */
function windowClauses(window: PricingRuleDateWindow): Prisma.PricingRuleWhereInput[] {
  return [
    { ruleType: { in: ['day_of_week', 'time_range'] } },
    { ruleType: 'date_time_range', params: { path: ['date'], gte: window.from, lte: window.to } },
    {
      ruleType: 'date_range',
      AND: [
        { params: { path: ['from'], lte: window.to } },
        { params: { path: ['to'], gte: window.from } },
      ],
    },
  ];
}

@Injectable()
export class PrismaPricingRuleRepository implements IPricingRuleRepository {
  async create(tx: PrismaTx, tenantId: string, data: NewPricingRule): Promise<PricingRuleRecord> {
    return toRecord(
      await tx.pricingRule.create({
        data: {
          tenantId,
          listingId: data.listingId,
          bookingMode: data.bookingMode as never,
          ruleType: data.ruleType as never,
          params: data.params as Prisma.InputJsonValue,
          price: BigInt(data.price),
          salePrice: data.salePrice ? BigInt(data.salePrice) : null,
          priority: data.priority,
        },
      }),
    );
  }

  async findById(tx: PrismaTx, id: string): Promise<PricingRuleRecord | null> {
    const p = await tx.pricingRule.findUnique({ where: { id } });
    return p ? toRecord(p) : null;
  }

  async listByListing(
    tx: PrismaTx,
    listingId: string,
    window?: PricingRuleDateWindow,
  ): Promise<PricingRuleRecord[]> {
    const items = await tx.pricingRule.findMany({
      where: { listingId, ...(window ? { OR: windowClauses(window) } : {}) },
      orderBy: { priority: 'desc' },
    });
    return items.map(toRecord);
  }

  async delete(tx: PrismaTx, id: string): Promise<void> {
    await tx.pricingRule.delete({ where: { id } });
  }
}
