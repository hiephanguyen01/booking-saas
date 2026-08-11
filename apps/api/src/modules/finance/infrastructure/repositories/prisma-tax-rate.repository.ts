import { Injectable } from '@nestjs/common';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import type { TaxRateCandidate } from '../../../../shared/domain/tax/tax';
import type { ITaxRateRepository } from '../../domain/ports/tax-rate-repository.port';

/**
 * `tax_rates` is global reference data — no tenant_id, no RLS — so this reads the
 * same handful of rows for every tenant. It still takes the caller's `tx` so the
 * resolved rate commits atomically with the booking that froze it.
 */
@Injectable()
export class PrismaTaxRateRepository implements ITaxRateRepository {
  async list(tx: PrismaTx): Promise<TaxRateCandidate[]> {
    const rows = await tx.taxRate.findMany({
      select: {
        id: true,
        category: true,
        rateBps: true,
        effectiveFrom: true,
        effectiveTo: true,
        legalRef: true,
      },
    });
    return rows.map((r) => ({
      id: r.id,
      category: r.category,
      rateBps: r.rateBps,
      effectiveFrom: r.effectiveFrom,
      effectiveTo: r.effectiveTo,
      legalRef: r.legalRef,
    }));
  }
}
