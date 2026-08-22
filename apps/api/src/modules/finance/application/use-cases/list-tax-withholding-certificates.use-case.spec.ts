import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb } from '~testing';
import type {
  ITaxComplianceRepository,
  TaxCertificateRecord,
} from '../../domain/ports/tax-compliance-repository.port';
import { ListTaxWithholdingCertificatesUseCase } from './list-tax-withholding-certificates.use-case';

const TENANT_ID = 'tenant-1';

function harness() {
  const calls: Array<{ tenantId: string; partnerId?: string }> = [];
  const rows = [] as TaxCertificateRecord[];
  const tenantDb = fakeTenantDb();
  return {
    useCase: new ListTaxWithholdingCertificatesUseCase(
      fakePort<ITaxComplianceRepository>({
        listCertificates: (_tx, tenantId, partnerId) => {
          calls.push({ tenantId, partnerId });
          return Promise.resolve(rows);
        },
      }),
      tenantDb.service,
    ),
    tenantDb,
    calls,
    rows,
  };
}

describe('ListTaxWithholdingCertificatesUseCase', () => {
  it('lists every certificate the tenant issued', async () => {
    const { useCase, tenantDb, calls, rows } = harness();

    await expect(useCase.execute(TENANT_ID)).resolves.toBe(rows);
    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(calls).toEqual([{ tenantId: TENANT_ID, partnerId: undefined }]);
  });

  it('narrows to one partner for the partner-facing view', async () => {
    // A withholding certificate is that partner's tax evidence; the filter is what
    // stops one household seeing another's.
    const { useCase, calls } = harness();

    await useCase.execute(TENANT_ID, 'partner-1');

    expect(calls).toEqual([{ tenantId: TENANT_ID, partnerId: 'partner-1' }]);
  });
});
