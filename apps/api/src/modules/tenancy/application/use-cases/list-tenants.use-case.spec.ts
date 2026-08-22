import { describe, expect, it } from 'vitest';
import { fakePort } from '~testing';
import type { ITenantRepository, TenantRecord } from '../../domain/ports/tenant-repository.port';
import type { RepoPage } from '../../../../shared/pagination/pagination';
import type { ListTenantsQuery } from '@booking/contracts';
import { ListTenantsUseCase } from './list-tenants.use-case';

const PAGE = { items: [], total: 0 } as unknown as RepoPage<TenantRecord>;

describe('ListTenantsUseCase', () => {
  it('passes every filter through — search, status and vertical', async () => {
    // The admin board's three filters are the whole feature; dropping one
    // silently widens the result set.
    const seen: unknown[] = [];
    const useCase = new ListTenantsUseCase(
      fakePort<ITenantRepository>({
        list: (args) => {
          seen.push(args);
          return Promise.resolve(PAGE);
        },
      }),
    );

    const result = await useCase.execute({
      page: 2,
      pageSize: 50,
      search: 'studio',
      status: 'suspended',
      vertical: 'sport',
    } as ListTenantsQuery);

    expect(seen).toEqual([
      { page: 2, pageSize: 50, search: 'studio', status: 'suspended', vertical: 'sport' },
    ]);
    expect(result).toBe(PAGE);
  });
});
