import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb } from '~testing';
import type {
  ITaxComplianceRepository,
  TaxFilingPeriodRecord,
} from '../../domain/ports/tax-compliance-repository.port';
import { PrepareTaxFilingPeriodUseCase } from './prepare-tax-filing-period.use-case';

const TENANT_ID = 'tenant-1';

describe('PrepareTaxFilingPeriodUseCase', () => {
  it('prepares the named month for the tenant, recording who asked', async () => {
    // The actor is stored on the period: a tax filing is an act someone performed,
    // not a row that appeared.
    const calls: unknown[] = [];
    const record = {} as TaxFilingPeriodRecord;
    const tenantDb = fakeTenantDb();
    const useCase = new PrepareTaxFilingPeriodUseCase(
      fakePort<ITaxComplianceRepository>({
        preparePeriod: (_tx, tenantId, year, month, actorId) => {
          calls.push({ tenantId, year, month, actorId });
          return Promise.resolve(record);
        },
      }),
      tenantDb.service,
    );

    await expect(useCase.execute(TENANT_ID, 2026, 8, 'staff-1')).resolves.toBe(record);
    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(calls).toEqual([{ tenantId: TENANT_ID, year: 2026, month: 8, actorId: 'staff-1' }]);
  });
});
