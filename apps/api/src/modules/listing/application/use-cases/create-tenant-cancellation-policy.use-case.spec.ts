import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb } from '~testing';
import type { ICancellationPolicyRepository } from '../../domain/ports/cancellation-policy-repository.port';
import { CreateTenantCancellationPolicyUseCase } from './create-tenant-cancellation-policy.use-case';

const TENANT_ID = 'tenant-1';
const POLICY_ID = 'policy-1';

const policy = (partnerId: string | null) =>
  ({
    id: POLICY_ID,
    tenantId: TENANT_ID,
    partnerId,
    name: 'Linh hoạt',
    rules: [{ hoursBefore: 24, refundPercent: 100 }],
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  }) as never;

describe('CreateTenantCancellationPolicyUseCase', () => {
  it('creates a policy owned by NOBODY, so every partner may attach it', async () => {
    // `partnerId: null` is what makes it shared; setting a partner here would
    // hide the tenant's own fallback inside one partner's list.
    const created: unknown[] = [];
    const tenantDb = fakeTenantDb();
    const useCase = new CreateTenantCancellationPolicyUseCase(
      fakePort<ICancellationPolicyRepository>({
        create: (_tx, _tenantId, data) => {
          created.push(data);
          return Promise.resolve(policy(null));
        },
        findTenantDefaultId: () => Promise.resolve(POLICY_ID),
      }),
      tenantDb.service,
    );

    const response = await useCase.execute(TENANT_ID, {
      name: 'Linh hoạt',
      rules: [{ hoursBefore: 24, refundPercent: 100 }],
    } as never);

    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(created[0]).toMatchObject({ partnerId: null });
    expect(response).toMatchObject({ isDefault: true });
  });
});
