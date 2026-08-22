import { describe, expect, it } from 'vitest';
import type { TenantContentReportsQuery } from '@booking/contracts';
import { fakePort, fakeTenantDb } from '~testing';
import type { IContentReportReader } from '../../domain/ports/content-report-reader.port';
import { ListContentReportsUseCase } from './list-content-reports.use-case';

const TENANT_ID = 'tenant-1';

describe('ListContentReportsUseCase', () => {
  it('echoes the requested page back with the mapped items', async () => {
    // The repository page carries only `items` and `total`; the response has to
    // restate the page it was asked for, or the client cannot paginate.
    const tenantDb = fakeTenantDb();
    const useCase = new ListContentReportsUseCase(
      fakePort<IContentReportReader>({
        list: () => Promise.resolve({ items: [], total: 42 } as never),
      }),
      tenantDb.service,
    );

    const query = { page: 3, pageSize: 20 } as TenantContentReportsQuery;
    await expect(useCase.execute(TENANT_ID, query)).resolves.toEqual({
      items: [],
      total: 42,
      page: 3,
      pageSize: 20,
    });
    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
  });
});
