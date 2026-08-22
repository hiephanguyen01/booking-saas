import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb } from '~testing';
import type {
  ITaxComplianceRepository,
  TaxFilingPeriodRecord,
} from '../../domain/ports/tax-compliance-repository.port';
import { ListTaxFilingPeriodsUseCase } from './list-tax-filing-periods.use-case';

const TENANT_ID = 'tenant-1';

describe('ListTaxFilingPeriodsUseCase', () => {
  it('passes the tenant id explicitly as well as through the GUC', async () => {
    // Tax rows are the ones an auditor reads back; the repository filters on the
    // id rather than relying on RLS alone.
    const asked: string[] = [];
    const rows = [] as TaxFilingPeriodRecord[];
    const tenantDb = fakeTenantDb();
    const useCase = new ListTaxFilingPeriodsUseCase(
      fakePort<ITaxComplianceRepository>({
        listPeriods: (_tx, tenantId) => {
          asked.push(tenantId);
          return Promise.resolve(rows);
        },
      }),
      tenantDb.service,
    );

    await expect(useCase.execute(TENANT_ID)).resolves.toBe(rows);
    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(asked).toEqual([TENANT_ID]);
  });
});
