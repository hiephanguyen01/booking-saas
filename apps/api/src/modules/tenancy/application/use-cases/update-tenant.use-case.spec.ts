import { describe, expect, it } from 'vitest';
import type { UpdateTenantInput } from '@booking/contracts';
import { fakePort } from '~testing';
import { TenantNotFound } from '../../../../shared/domain/errors/tenant-not-found';
import type { ITenantCache } from '../../domain/ports/tenant-cache.port';
import type {
  DomainRecord,
  ITenantDomainRepository,
} from '../../domain/ports/tenant-domain-repository.port';
import type { ITenantRepository, TenantRecord } from '../../domain/ports/tenant-repository.port';
import { UpdateTenantUseCase } from './update-tenant.use-case';

const TENANT_ID = 'tenant-1';
const HOSTS = [
  { hostname: 'studiohub.vn' },
  { hostname: 'admin.studiohub.vn' },
] as DomainRecord[];

function harness(found: TenantRecord | null = ({ id: TENANT_ID } as TenantRecord)) {
  const patches: UpdateTenantInput[] = [];
  const evicted: string[] = [];
  return {
    useCase: new UpdateTenantUseCase(
      fakePort<ITenantRepository>({
        findById: () => Promise.resolve(found),
        update: (id, patch) => {
          patches.push(patch as UpdateTenantInput);
          return Promise.resolve({ id, ...patch } as TenantRecord);
        },
      }),
      fakePort<ITenantDomainRepository>({ listByTenant: () => Promise.resolve(HOSTS) }),
      fakePort<ITenantCache>({
        invalidateHost: (hostname) => {
          evicted.push(hostname);
          return Promise.resolve();
        },
      }),
    ),
    patches,
    evicted,
  };
}

describe('UpdateTenantUseCase', () => {
  it('answers not-found for an unknown tenant', async () => {
    const { useCase, patches } = harness(null);

    await expect(useCase.execute(TENANT_ID, { name: 'Mới' } as UpdateTenantInput)).rejects.toBeInstanceOf(
      TenantNotFound,
    );
    expect(patches).toEqual([]);
  });

  it('EVICTS every mapped host on a status change', async () => {
    // Status flips the storefront between live and suspended, and the host
    // cache holds the resolution for a minute — a suspension that takes effect
    // a minute late is a suspension that did not happen.
    const { useCase, evicted } = harness();

    await useCase.execute(TENANT_ID, { status: 'suspended' } as UpdateTenantInput);

    expect(evicted).toEqual(['studiohub.vn', 'admin.studiohub.vn']);
  });

  it('evicts on a status change to active too, not only to suspended', async () => {
    const { useCase, evicted } = harness();

    await useCase.execute(TENANT_ID, { status: 'active' } as UpdateTenantInput);

    expect(evicted).toHaveLength(2);
  });

  it('spends no eviction on an edit that leaves the status alone', async () => {
    // A rename cannot change whether the storefront serves traffic.
    const { useCase, evicted, patches } = harness();

    await useCase.execute(TENANT_ID, { name: 'Tên Mới' } as UpdateTenantInput);

    expect(patches).toEqual([{ name: 'Tên Mới' }]);
    expect(evicted).toEqual([]);
  });
});
