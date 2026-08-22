import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb } from '~testing';
import {
  TaxFilingConcurrentChange,
  TaxFilingNotFound,
} from '../../domain/errors/finance-domain-errors';
import type {
  ITaxComplianceRepository,
  TaxFilingPeriodRecord,
} from '../../domain/ports/tax-compliance-repository.port';
import { SubmitTaxFilingPeriodUseCase } from './submit-tax-filing-period.use-case';

const TENANT_ID = 'tenant-1';
const PERIOD_ID = 'period-1';

const period = (status = 'draft') => ({ id: PERIOD_ID, status }) as TaxFilingPeriodRecord;

function harness(
  record: TaxFilingPeriodRecord | null,
  submitted: TaxFilingPeriodRecord | null = period('submitted'),
) {
  const calls: unknown[] = [];
  const tenantDb = fakeTenantDb();
  return {
    useCase: new SubmitTaxFilingPeriodUseCase(
      fakePort<ITaxComplianceRepository>({
        findPeriod: () => Promise.resolve(record),
        submitPeriod: (_tx, periodId, expectedStatus, actorId, reference) => {
          calls.push({ periodId, expectedStatus, actorId, reference });
          return Promise.resolve(submitted);
        },
      }),
      tenantDb.service,
    ),
    tenantDb,
    calls,
  };
}

describe('SubmitTaxFilingPeriodUseCase', () => {
  it('rejects a period this tenant does not have', async () => {
    const { useCase, calls } = harness(null);

    await expect(
      useCase.execute(TENANT_ID, PERIOD_ID, 'TK-2026-08', 'staff-1'),
    ).rejects.toBeInstanceOf(TaxFilingNotFound);
    expect(calls).toEqual([]);
  });

  it('refuses to submit a period that is not a draft', async () => {
    // A filing already sent to the tax authority cannot be sent again with a
    // different reference.
    const { useCase, calls } = harness(period('submitted'));

    await expect(useCase.execute(TENANT_ID, PERIOD_ID, 'TK-2026-08', 'staff-1')).rejects.toThrow();
    expect(calls).toEqual([]);
  });

  it('submits with a compare-and-set on the draft status', async () => {
    // The guard above reads a snapshot; the expected status on the write is what
    // actually makes two concurrent submits produce one.
    const { useCase, tenantDb, calls } = harness(period('draft'));

    await useCase.execute(TENANT_ID, PERIOD_ID, 'TK-2026-08', 'staff-1');

    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(calls).toEqual([
      {
        periodId: PERIOD_ID,
        expectedStatus: 'draft',
        actorId: 'staff-1',
        reference: 'TK-2026-08',
      },
    ]);
  });

  it('fails when the guarded write matched no row', async () => {
    const { useCase } = harness(period('draft'), null);

    await expect(
      useCase.execute(TENANT_ID, PERIOD_ID, 'TK-2026-08', 'staff-1'),
    ).rejects.toBeInstanceOf(TaxFilingConcurrentChange);
  });
});
