import { describe, expect, it } from 'vitest';
import { fakeCollaborator, fakeTenantDb } from '~testing';
import { PayoutPolicy } from '../../domain/value-objects/payout-policy.value-object';
import type { GetPayoutPolicyUseCase } from './get-payout-policy.use-case';
import { GetTenantPayoutPolicyUseCase } from './get-tenant-payout-policy.use-case';

const TENANT_ID = 'tenant-1';

describe('GetTenantPayoutPolicyUseCase', () => {
  it('serialises the minimum as a string so the đồng amount survives JSON', async () => {
    // A bigint cannot be JSON-encoded, and a number would lose precision on a
    // large VND figure — the DTO carries it as a decimal string.
    const tenantDb = fakeTenantDb();
    const useCase = new GetTenantPayoutPolicyUseCase(
      fakeCollaborator<GetPayoutPolicyUseCase>({
        execute: () =>
          Promise.resolve(
            PayoutPolicy.fromStored({
              payout: { holdingDays: 5, minAmount: '9007199254740993', cycle: 'weekly' },
            }),
          ),
      }),
      tenantDb.service,
    );

    await expect(useCase.execute(TENANT_ID)).resolves.toEqual({
      holdingDays: 5,
      minAmount: '9007199254740993',
      cycle: 'weekly',
    });
    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
  });
});
