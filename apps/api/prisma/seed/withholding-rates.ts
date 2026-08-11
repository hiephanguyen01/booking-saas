import type { PrismaClient } from '@prisma/client';

/**
 * NĐ 117/2025 withholding schedule for resident household/individual sellers.
 * It is national law, not demo data, and therefore runs in every seed scope.
 */
const WITHHOLDING_SCHEDULE = [
  {
    activity: 'service',
    vatBps: 500,
    pitBps: 200,
    effectiveFrom: '2025-07-01T00:00:00+07:00',
    effectiveTo: null,
    legalRef: 'NĐ 117/2025/NĐ-CP',
  },
] as const;

/** Idempotent on the (activity, effective_from) unique key. */
export async function seedWithholdingRates(prisma: PrismaClient): Promise<void> {
  for (const row of WITHHOLDING_SCHEDULE) {
    const data = {
      vatBps: row.vatBps,
      pitBps: row.pitBps,
      effectiveTo: row.effectiveTo ? new Date(row.effectiveTo) : null,
      legalRef: row.legalRef,
    };
    await prisma.withholdingRate.upsert({
      where: {
        activity_effectiveFrom: {
          activity: row.activity,
          effectiveFrom: new Date(row.effectiveFrom),
        },
      },
      update: data,
      create: {
        activity: row.activity,
        effectiveFrom: new Date(row.effectiveFrom),
        ...data,
      },
    });
  }
}
