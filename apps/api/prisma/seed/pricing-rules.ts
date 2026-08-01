import { Prisma, type PricingRule as PrismaPricingRule } from '@prisma/client';
import {
  pricingRuleInputSchema,
  type PricingRuleInput,
  type PricingRuleType,
} from '@booking/contracts';
import {
  PricingRule,
  findOverlappingRecurring,
  sameWindowKey,
  type NewPricingRule,
} from '../../src/modules/listing/domain/entities/pricing-rule.entity';
import { prisma } from './client';

type SeedOwnedPricingRule = PricingRuleInput & { id: string };

type ReconcileSeedPricingRulesInput = {
  tenantId: string;
  listingId: string;
  desired: readonly SeedOwnedPricingRule[];
  legacy: readonly PricingRuleInput[];
};

type ScopeRule = Pick<NewPricingRule, 'bookingMode' | 'ruleType' | 'params'>;

function openSeedRule(listingId: string, input: PricingRuleInput): NewPricingRule {
  const parsed = pricingRuleInputSchema.parse(input);
  return PricingRule.open({
    listingId,
    bookingMode: parsed.bookingMode,
    ruleType: parsed.ruleType,
    params: parsed.params,
    price: parsed.price,
    salePrice: parsed.salePrice ?? null,
    saleStartsAt: parsed.saleStartsAt ? new Date(parsed.saleStartsAt) : null,
    saleEndsAt: parsed.saleEndsAt ? new Date(parsed.saleEndsAt) : null,
    campaignLabel: parsed.campaignLabel ?? null,
    priority: parsed.priority,
  });
}

function scopeOf(rule: PrismaPricingRule): ScopeRule {
  return {
    bookingMode: rule.bookingMode,
    ruleType: rule.ruleType,
    params: rule.params as Record<string, unknown>,
  };
}

function scopeWhere(tenantId: string, rule: NewPricingRule): Prisma.PricingRuleWhereInput {
  return {
    tenantId,
    listingId: rule.listingId,
    bookingMode: rule.bookingMode,
    ruleType: rule.ruleType as PricingRuleType,
    // jsonb equality makes this an exact scope match, independent of object key order.
    params: { equals: rule.params as Prisma.InputJsonValue },
  };
}

function sameLegacyFixture(stored: PrismaPricingRule, expected: NewPricingRule): boolean {
  return (
    stored.price === BigInt(expected.price) &&
    stored.salePrice === (expected.salePrice ? BigInt(expected.salePrice) : null) &&
    stored.saleStartsAt?.getTime() === expected.saleStartsAt?.getTime() &&
    stored.saleEndsAt?.getTime() === expected.saleEndsAt?.getTime() &&
    stored.campaignLabel === expected.campaignLabel &&
    stored.priority === expected.priority
  );
}

function dataFor(
  rule: NewPricingRule,
): Omit<Prisma.PricingRuleUncheckedCreateInput, 'id' | 'tenantId'> {
  return {
    listingId: rule.listingId,
    bookingMode: rule.bookingMode,
    ruleType: rule.ruleType,
    params: rule.params as Prisma.InputJsonValue,
    price: BigInt(rule.price),
    salePrice: rule.salePrice ? BigInt(rule.salePrice) : null,
    saleStartsAt: rule.saleStartsAt,
    saleEndsAt: rule.saleEndsAt,
    campaignLabel: rule.campaignLabel,
    priority: rule.priority,
  };
}

function scopeLabel(rule: ScopeRule): string {
  return `${rule.bookingMode}/${rule.ruleType}/${JSON.stringify(rule.params)}`;
}

function overlapError(
  listingId: string,
  desired: NewPricingRule,
  conflict: PrismaPricingRule,
): Error {
  return new Error(
    `Seed pricing-rule reconciliation refused for listing ${listingId}: ${scopeLabel(desired)} overlaps rule ${conflict.id} (${scopeLabel(scopeOf(conflict))}), which is not a known seed fixture.`,
  );
}

/**
 * Reconciles seed-owned pricing rules without touching an operator's rules.
 *
 * Fixed ids are the seed's ownership boundary. The prior all-days peak rule is
 * deleted only after its exact scope and values have been verified; every other
 * overlap is rejected before any write.
 */
export async function reconcileSeedPricingRules({
  tenantId,
  listingId,
  desired,
  legacy,
}: ReconcileSeedPricingRulesInput): Promise<void> {
  const desiredRules = desired.map((seedRule) => ({
    id: seedRule.id,
    rule: openSeedRule(listingId, seedRule),
  }));
  const legacyRules = legacy.map((rule) => openSeedRule(listingId, rule));
  const desiredIds = new Set(desiredRules.map(({ id }) => id));

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`seed-pricing-rule:${listingId}`}))`,
    );

    const [storedRules, ownedRules] = await Promise.all([
      tx.pricingRule.findMany({ where: { tenantId, listingId } }),
      tx.pricingRule.findMany({ where: { id: { in: [...desiredIds] } } }),
    ]);
    for (const ownedRule of ownedRules) {
      if (ownedRule.tenantId !== tenantId || ownedRule.listingId !== listingId) {
        throw new Error(
          `Seed pricing-rule reconciliation refused for listing ${listingId}: seed-owned rule id ${ownedRule.id} belongs to another listing or tenant.`,
        );
      }
    }

    const legacyIds = new Set<string>();
    for (const legacyRule of legacyRules) {
      const matches = await tx.pricingRule.findMany({
        where: scopeWhere(tenantId, legacyRule),
      });
      for (const stored of matches) {
        if (!sameLegacyFixture(stored, legacyRule)) {
          throw new Error(
            `Seed pricing-rule reconciliation refused for listing ${listingId}: legacy scope ${scopeLabel(legacyRule)} differs from the known fixture. Restore or remove that rule before re-seeding.`,
          );
        }
        legacyIds.add(stored.id);
      }
    }

    const permittedIds = new Set([...desiredIds, ...legacyIds]);
    const operatorRules = storedRules.filter((stored) => !permittedIds.has(stored.id));
    for (const { id, rule } of desiredRules) {
      const scopeOwner = operatorRules.find((stored) => sameWindowKey(scopeOf(stored), rule));
      if (scopeOwner) {
        throw new Error(
          `Seed pricing-rule reconciliation refused for listing ${listingId}: desired scope ${scopeLabel(rule)} is owned by rule ${scopeOwner.id}, not deterministic seed id ${id}.`,
        );
      }
      const overlap = findOverlappingRecurring(operatorRules.map(scopeOf), rule);
      if (overlap) {
        const conflict = operatorRules.find((stored) => sameWindowKey(scopeOf(stored), overlap));
        if (conflict) throw overlapError(listingId, rule, conflict);
      }
    }

    if (legacyIds.size > 0) {
      await tx.pricingRule.deleteMany({ where: { id: { in: [...legacyIds] } } });
    }

    const ownedById = new Map(ownedRules.map((rule) => [rule.id, rule]));
    for (const { id, rule } of desiredRules) {
      const data = dataFor(rule);
      if (ownedById.has(id)) {
        await tx.pricingRule.update({ where: { id }, data });
      } else {
        await tx.pricingRule.create({ data: { id, tenantId, ...data } });
      }
    }
  });
}
