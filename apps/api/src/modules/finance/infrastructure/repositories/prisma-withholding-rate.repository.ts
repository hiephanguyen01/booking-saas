import { Injectable } from '@nestjs/common';
import type { WithholdingRateCandidate } from '../../../../shared/domain/tax/withholding';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import type { IWithholdingRateRepository } from '../../domain/ports/withholding-rate-repository.port';

/** Global legal reference data, read in the booking's existing tenant transaction. */
@Injectable()
export class PrismaWithholdingRateRepository implements IWithholdingRateRepository {
  async list(tx: PrismaTx): Promise<WithholdingRateCandidate[]> {
    const rows = await tx.withholdingRate.findMany({
      select: {
        id: true,
        activity: true,
        vatBps: true,
        pitBps: true,
        effectiveFrom: true,
        effectiveTo: true,
        legalRef: true,
      },
    });
    return rows.map((row) => ({
      id: row.id,
      activity: row.activity,
      vatBps: row.vatBps,
      pitBps: row.pitBps,
      effectiveFrom: row.effectiveFrom,
      effectiveTo: row.effectiveTo,
      legalRef: row.legalRef,
    }));
  }
}
