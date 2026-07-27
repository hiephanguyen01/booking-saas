import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import type { RuleType } from '../../../../shared/domain/pricing/quote-calculator';
import type {
  IPricingRuleRepository,
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

  async listByListing(tx: PrismaTx, listingId: string): Promise<PricingRuleRecord[]> {
    const items = await tx.pricingRule.findMany({
      where: { listingId },
      orderBy: { priority: 'desc' },
    });
    return items.map(toRecord);
  }

  async delete(tx: PrismaTx, id: string): Promise<void> {
    await tx.pricingRule.delete({ where: { id } });
  }
}
