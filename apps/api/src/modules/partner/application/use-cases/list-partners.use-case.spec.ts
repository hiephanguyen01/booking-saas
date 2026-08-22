import { describe, expect, it } from 'vitest';
import type { ListPartnersQuery } from '@booking/contracts';
import { fakePort, fakeTenantDb } from '~testing';
import type { IPartnerReader } from '../../domain/ports/partner-reader.port';
import type { PartnerRecord } from '../../domain/ports/partner-repository.port';
import type { RepoPageWithCounts } from '../../../../shared/pagination/pagination';
import { ListPartnersUseCase } from './list-partners.use-case';

const PAGE = { items: [], total: 0, counts: {} } as unknown as RepoPageWithCounts<PartnerRecord>;

describe('ListPartnersUseCase', () => {
  it('passes the status filter, the search and the pagination through', async () => {
    // The tenant's partner board is these three filters; dropping one silently
    // widens the list.
    const seen: unknown[] = [];
    const tenantDb = fakeTenantDb();
    const useCase = new ListPartnersUseCase(
      fakePort<IPartnerReader>({
        list: (_tx, args) => {
          seen.push(args);
          return Promise.resolve(PAGE);
        },
      }),
      tenantDb.service,
    );

    const result = await useCase.execute('tenant-1', {
      status: 'pending',
      q: 'giang',
      page: 2,
      pageSize: 50,
    } as ListPartnersQuery);

    expect(tenantDb.openedFor).toEqual(['tenant-1']);
    expect(seen).toEqual([{ status: 'pending', q: 'giang', page: 2, pageSize: 50 }]);
    expect(result).toBe(PAGE);
  });
});
