import type { PrismaClient } from '@prisma/client';

/**
 * The Vietnamese VAT schedule. These are legal constants, not demo data, so this
 * runs in EVERY scope including production — same rule as the permission
 * catalogue in `platform.ts`.
 *
 * The 10% row is seeded ALREADY, opening the instant the 2% reduction
 * (NQ 204/2025/QH15) lapses. The 2027-01-01 changeover therefore needs no deploy,
 * no migration and no human: `selectTaxRate` simply starts matching the next row.
 *
 * Times are +07:00 (Asia/Ho_Chi_Minh) because a tax period is a Vietnamese
 * calendar date, not a UTC one — 2027-01-01T00:00+07 is 2026-12-31T17:00Z.
 */
const VAT_SCHEDULE = [
  {
    category: 'standard',
    rateBps: 800,
    effectiveFrom: '2025-07-01T00:00:00+07:00',
    effectiveTo: '2027-01-01T00:00:00+07:00',
    legalRef: 'NQ 204/2025/QH15',
  },
  {
    category: 'standard',
    rateBps: 1000,
    effectiveFrom: '2027-01-01T00:00:00+07:00',
    effectiveTo: null,
    legalRef: 'Luật 48/2024/QH15',
  },
  {
    category: 'reduced_5',
    rateBps: 500,
    effectiveFrom: '2025-07-01T00:00:00+07:00',
    effectiveTo: null,
    legalRef: 'Luật 48/2024/QH15 Đ.9',
  },
  {
    category: 'exempt',
    rateBps: 0,
    effectiveFrom: '2025-07-01T00:00:00+07:00',
    effectiveTo: null,
    legalRef: 'Luật 48/2024/QH15 Đ.5',
  },
  {
    category: 'not_taxable',
    rateBps: 0,
    effectiveFrom: '2025-07-01T00:00:00+07:00',
    effectiveTo: null,
    legalRef: 'Luật 48/2024/QH15 Đ.5',
  },
] as const;

/** Idempotent on the (category, effective_from) unique key. */
export async function seedTaxRates(prisma: PrismaClient): Promise<void> {
  for (const row of VAT_SCHEDULE) {
    const data = {
      rateBps: row.rateBps,
      effectiveTo: row.effectiveTo ? new Date(row.effectiveTo) : null,
      legalRef: row.legalRef,
    };
    await prisma.taxRate.upsert({
      where: {
        category_effectiveFrom: {
          category: row.category,
          effectiveFrom: new Date(row.effectiveFrom),
        },
      },
      update: data,
      create: {
        category: row.category,
        effectiveFrom: new Date(row.effectiveFrom),
        ...data,
      },
    });
  }
}
