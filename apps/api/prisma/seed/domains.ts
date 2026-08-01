import { Prisma } from '@prisma/client';
import { prisma } from './client';

type SeedDomain = { hostname: string; isPrimary: boolean };

/**
 * Reconciles the seed's hostnames without taking a verified hostname or primary
 * selection away from a tenant operator. Full demo seeding may explicitly
 * restore the staging hostname only when the current primary is another seed host.
 */
export async function reconcileSeedDomains(input: {
  tenantId: string;
  domains: readonly SeedDomain[];
  restoreCanonicalPrimary: boolean;
}): Promise<void> {
  const primary = input.domains.find((domain) => domain.isPrimary);
  if (!primary)
    throw new Error('Seed domain reconciliation requires one canonical primary hostname.');

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`seed-domain:${input.tenantId}`}))`,
    );

    const existing = await Promise.all(
      input.domains.map(async (domain) => ({
        domain,
        record: await tx.tenantDomain.findUnique({ where: { hostname: domain.hostname } }),
      })),
    );
    for (const { domain, record } of existing) {
      if (record && record.tenantId !== input.tenantId) {
        throw new Error(
          `Seed domain reconciliation refused: ${domain.hostname} belongs to tenant ${record.tenantId}, not ${input.tenantId}.`,
        );
      }
    }

    const currentPrimary = await tx.tenantDomain.findFirst({
      where: { tenantId: input.tenantId, isPrimary: true },
    });
    const seedHostnames = new Set(input.domains.map((domain) => domain.hostname));
    const canRestoreCanonical =
      input.restoreCanonicalPrimary &&
      currentPrimary !== null &&
      seedHostnames.has(currentPrimary.hostname);
    const promoteCanonical =
      currentPrimary === null ||
      currentPrimary.hostname === primary.hostname ||
      canRestoreCanonical;

    if (canRestoreCanonical && currentPrimary!.hostname !== primary.hostname) {
      // Demote the other seed host before promoting staging: partial unique index safety.
      await tx.tenantDomain.update({
        where: { id: currentPrimary!.id },
        data: { isPrimary: false },
      });
    }

    for (const { domain, record } of existing.filter(({ domain }) => !domain.isPrimary)) {
      if (!record) {
        await tx.tenantDomain.create({
          data: {
            tenantId: input.tenantId,
            hostname: domain.hostname,
            isPrimary: false,
            verifiedAt: new Date(),
          },
        });
      }
    }

    const primaryRecord = existing.find(({ domain }) => domain.isPrimary)?.record;
    if (!primaryRecord) {
      await tx.tenantDomain.create({
        data: {
          tenantId: input.tenantId,
          hostname: primary.hostname,
          isPrimary: promoteCanonical,
          verifiedAt: new Date(),
        },
      });
    } else if (promoteCanonical && !primaryRecord.isPrimary) {
      // Existing verification timestamps are operator/audit state and stay untouched.
      await tx.tenantDomain.update({ where: { id: primaryRecord.id }, data: { isPrimary: true } });
    }
  });
}
