import type { PrismaClient } from '@prisma/client';

/**
 * National household annual-revenue thresholds. Legal reference data runs in
 * every seed scope. Times use Vietnam midnight because tax years are local
 * calendar years, not UTC years.
 *
 * NĐ 141/2026 retroactively replaced the short-lived 500M wording for 2026,
 * so the active legal schedule jumps from 200M through 2025 to 1B from 2026.
 */
const THRESHOLD_SCHEDULE = [
  {
    code: 'household_annual_revenue',
    thresholdAmount: 200_000_000n,
    effectiveFrom: '2025-01-01T00:00:00+07:00',
    effectiveTo: '2026-01-01T00:00:00+07:00',
    publishedAt: '2024-11-26T00:00:00+07:00',
    legalRef: 'Luật 48/2024/QH15',
    revision: 1,
  },
  {
    code: 'household_annual_revenue',
    thresholdAmount: 1_000_000_000n,
    effectiveFrom: '2026-01-01T00:00:00+07:00',
    effectiveTo: null,
    publishedAt: '2026-05-25T00:00:00+07:00',
    legalRef: 'NĐ 141/2026/NĐ-CP',
    revision: 2,
  },
] as const;

export async function seedTaxThresholdRules(prisma: PrismaClient): Promise<void> {
  for (const row of THRESHOLD_SCHEDULE) {
    const effectiveFrom = new Date(row.effectiveFrom);
    const data = {
      thresholdAmount: row.thresholdAmount,
      effectiveTo: row.effectiveTo ? new Date(row.effectiveTo) : null,
      publishedAt: new Date(row.publishedAt),
      legalRef: row.legalRef,
      isActive: true,
    };
    await prisma.taxThresholdRule.upsert({
      where: {
        code_effectiveFrom_revision: {
          code: row.code,
          effectiveFrom,
          revision: row.revision,
        },
      },
      update: data,
      create: {
        code: row.code,
        effectiveFrom,
        revision: row.revision,
        ...data,
      },
    });
  }
}
