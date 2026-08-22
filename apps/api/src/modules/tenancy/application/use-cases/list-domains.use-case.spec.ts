import { describe, expect, it } from 'vitest';
import { fakePort } from '~testing';
import type {
  DomainRecord,
  ITenantDomainRepository,
} from '../../domain/ports/tenant-domain-repository.port';
import { ListDomainsUseCase } from './list-domains.use-case';

const ROWS = [{ id: 'domain-1', hostname: 'dat.studiohub.vn' }] as DomainRecord[];

describe('ListDomainsUseCase', () => {
  it('lists the domains of the tenant it was asked about', async () => {
    // Domains carry the verification token; listing another tenant's would hand
    // over what proves ownership of their hostname.
    const asked: string[] = [];
    const useCase = new ListDomainsUseCase(
      fakePort<ITenantDomainRepository>({
        listByTenant: (tenantId) => {
          asked.push(tenantId);
          return Promise.resolve(ROWS);
        },
      }),
    );

    const result = await useCase.execute('tenant-1');

    expect(asked).toEqual(['tenant-1']);
    expect(result).toBe(ROWS);
  });
});
