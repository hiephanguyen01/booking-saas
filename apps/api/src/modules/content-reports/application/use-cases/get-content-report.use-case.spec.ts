import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb } from '~testing';
import { ContentReportNotFound } from '../../domain/errors/content-report-errors';
import type { IContentReportReader } from '../../domain/ports/content-report-reader.port';
import { GetContentReportUseCase } from './get-content-report.use-case';

const TENANT_ID = 'tenant-1';
const REPORT_ID = 'report-1';

const report = () =>
  ({
    id: REPORT_ID,
    target: 'listing',
    targetId: 'listing-1',
    status: 'open',
    reason: 'spam',
    details: null,
    reporterUserId: 'user-1',
    reporterName: 'Ann',
    createdAt: new Date('2026-08-01T00:00:00Z'),
    updatedAt: new Date('2026-08-01T00:00:00Z'),
  }) as never;

function harness(record: unknown) {
  const tenantDb = fakeTenantDb();
  return {
    useCase: new GetContentReportUseCase(
      fakePort<IContentReportReader>({ findById: () => Promise.resolve(record as never) }),
      tenantDb.service,
    ),
    tenantDb,
  };
}

describe('GetContentReportUseCase', () => {
  it('reads inside the tenant transaction', async () => {
    // The 404 below is only a 404 because RLS already scoped the read; without
    // `forTenant` another tenant's report id would resolve.
    const { useCase, tenantDb } = harness(report());

    await expect(useCase.execute(TENANT_ID, REPORT_ID)).resolves.toMatchObject({ id: REPORT_ID });
    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
  });

  it('answers 404 for a report this tenant does not have', async () => {
    const { useCase } = harness(null);

    await expect(useCase.execute(TENANT_ID, REPORT_ID)).rejects.toBeInstanceOf(
      ContentReportNotFound,
    );
  });
});
