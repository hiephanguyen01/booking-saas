import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb } from '~testing';
import type { ICancellationPolicyRepository } from '../../domain/ports/cancellation-policy-repository.port';
import { ListTenantCancellationPoliciesUseCase } from './list-tenant-cancellation-policies.use-case';

const TENANT_ID = 'tenant-1';

describe('ListTenantCancellationPoliciesUseCase', () => {
  it('lists ONLY tenant-level policies, flagged against the tenant default', async () => {
    // This is the tenant's own fallback picker; a partner-owned policy appearing
    // here could be chosen as the tenant-wide default it is not allowed to be.
    const listed: string[] = [];
    const tenantDb = fakeTenantDb();
    const useCase = new ListTenantCancellationPoliciesUseCase(
      fakePort<ICancellationPolicyRepository>({
        listTenantLevel: () => {
          listed.push('listTenantLevel');
          return Promise.resolve([
            {
              id: 'shared',
              partnerId: null,
              tenantId: TENANT_ID,
              name: 'shared',
              rules: [],
              createdAt: new Date('2026-01-01T00:00:00Z'),
              updatedAt: new Date('2026-01-01T00:00:00Z'),
            },
          ] as never);
        },
        findTenantDefaultId: () => Promise.resolve('shared'),
      }),
      tenantDb.service,
    );

    const rows = await useCase.execute(TENANT_ID);

    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(listed).toEqual(['listTenantLevel']);
    expect(rows[0]).toMatchObject({ id: 'shared', isDefault: true });
  });
});
