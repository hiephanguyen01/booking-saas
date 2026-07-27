import type { Prisma, PrismaClient } from '@prisma/client';
import { z } from 'zod';
import administrativeDivisions from '../data/vn-administrative-divisions-2025.json';

const provinceSchema = z.object({
  code: z.string().regex(/^\d{2}$/),
  name: z.string().min(1),
  type: z.enum(['province', 'municipality']),
  sortOrder: z.number().int().positive(),
});

const wardSchema = z.object({
  code: z.string().regex(/^\d{5}$/),
  provinceCode: z.string().regex(/^\d{2}$/),
  name: z.string().min(1),
  type: z.enum(['ward', 'commune', 'special_zone']),
  sortOrder: z.number().int().positive(),
});

const fixtureSchema = z.object({
  metadata: z.object({
    document: z.literal('19/2025/QĐ-TTg'),
    issuedAt: z.string(),
    effectiveFrom: z.literal('2025-07-01'),
    provinceCount: z.literal(34),
    wardCount: z.literal(3321),
    sourceFiles: z.array(z.object({ url: z.string().url(), sha256: z.string().length(64) })),
  }),
  provinces: z.array(provinceSchema).length(34),
  wards: z.array(wardSchema).length(3321),
});

function unique(values: readonly string[], label: string): void {
  if (new Set(values).size !== values.length) {
    throw new Error(`Administrative fixture contains duplicate ${label}`);
  }
}

async function inBatches<T>(
  values: readonly T[],
  size: number,
  run: (batch: readonly T[]) => Promise<void>,
): Promise<void> {
  for (let index = 0; index < values.length; index += size) {
    await run(values.slice(index, index + size));
  }
}

/** Seed the production-required, global administrative catalog idempotently. */
export async function seedAdministrativeDivisions(prisma: PrismaClient): Promise<void> {
  const fixture = fixtureSchema.parse(administrativeDivisions as unknown);
  const provinceCodes = new Set(fixture.provinces.map((province) => province.code));

  unique(
    fixture.provinces.map((province) => province.code),
    'province codes',
  );
  unique(
    fixture.wards.map((ward) => ward.code),
    'ward codes',
  );
  for (const ward of fixture.wards) {
    if (!provinceCodes.has(ward.provinceCode)) {
      throw new Error(`Ward ${ward.code} references unknown province ${ward.provinceCode}`);
    }
  }

  const effectiveFrom = new Date(`${fixture.metadata.effectiveFrom}T00:00:00.000Z`);
  await prisma.$transaction(
    fixture.provinces.map((province) =>
      prisma.administrativeProvince.upsert({
        where: { code: province.code },
        update: {
          name: province.name,
          type: province.type,
          sortOrder: province.sortOrder,
          effectiveFrom,
        },
        create: { ...province, effectiveFrom },
      }),
    ),
  );

  await inBatches(fixture.wards, 100, async (batch) => {
    await prisma.$transaction(
      batch.map((ward) =>
        prisma.administrativeWard.upsert({
          where: { code: ward.code },
          update: {
            provinceCode: ward.provinceCode,
            name: ward.name,
            type: ward.type,
            sortOrder: ward.sortOrder,
            effectiveFrom,
          },
          create: { ...ward, effectiveFrom },
        }),
      ) as Prisma.PrismaPromise<unknown>[],
    );
  });

  console.log(
    `Seeded ${fixture.provinces.length} provinces and ${fixture.wards.length} wards from ${fixture.metadata.document}`,
  );
}
