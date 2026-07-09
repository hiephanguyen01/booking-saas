import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import type {
  AvailabilityRuleInputData,
  AvailabilityRuleRecord,
  IAvailabilityRuleRepository,
} from '../../domain/ports/availability-rule-repository.port';

type Row = Prisma.AvailabilityRuleGetPayload<Record<string, never>>;

function toRecord(r: Row): AvailabilityRuleRecord {
  return {
    id: r.id,
    listingId: r.listingId,
    dayOfWeek: r.dayOfWeek,
    openTime: r.openTime,
    closeTime: r.closeTime,
  };
}

@Injectable()
export class PrismaAvailabilityRuleRepository implements IAvailabilityRuleRepository {
  async listByListing(tx: PrismaTx, listingId: string): Promise<AvailabilityRuleRecord[]> {
    const rows = await tx.availabilityRule.findMany({
      where: { listingId },
      orderBy: [{ dayOfWeek: 'asc' }, { openTime: 'asc' }],
    });
    return rows.map(toRecord);
  }

  async replaceForListing(
    tx: PrismaTx,
    tenantId: string,
    listingId: string,
    rules: AvailabilityRuleInputData[],
  ): Promise<AvailabilityRuleRecord[]> {
    await tx.availabilityRule.deleteMany({ where: { listingId } });
    if (rules.length > 0) {
      await tx.availabilityRule.createMany({
        data: rules.map((r) => ({
          tenantId,
          listingId,
          dayOfWeek: r.dayOfWeek,
          openTime: r.openTime,
          closeTime: r.closeTime,
        })),
      });
    }
    return this.listByListing(tx, listingId);
  }
}
