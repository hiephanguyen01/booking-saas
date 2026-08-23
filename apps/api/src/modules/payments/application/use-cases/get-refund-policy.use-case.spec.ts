import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantContext, fakeTenantDb } from '~testing';
import type { IRefundPolicyRepository } from '../../domain/ports/refund-policy-repository.port';
import { GetRefundPolicyUseCase } from './get-refund-policy.use-case';

const TENANT_ID = 'tenant-1';

describe('GetRefundPolicyUseCase', () => {
  it('returns the tenant current refund policy', async () => {
    const tenantDb = fakeTenantDb();
    const useCase = new GetRefundPolicyUseCase(
      fakePort<IRefundPolicyRepository>({
        get: () =>
          Promise.resolve({ refundStrategy: 'automatic_preferred', manualRefundSlaHours: 48 }),
      }),
      fakeTenantContext(TENANT_ID),
      tenantDb.service,
    );

    await expect(useCase.execute()).resolves.toEqual({
      refundStrategy: 'automatic_preferred',
      manualRefundSlaHours: 48,
    });
    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
  });
});
