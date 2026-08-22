import { NotFoundException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import type { PayoutPolicyDto } from '@booking/contracts';
import { fakePort, fakeTenantDb } from '~testing';
import type { IPayoutPolicyStore } from '../../domain/ports/payout-policy-store.port';
import { UpdatePayoutPolicyUseCase } from './update-payout-policy.use-case';

const TENANT_ID = 'tenant-1';

function harness(saved = true) {
  const stored: unknown[] = [];
  const tenantDb = fakeTenantDb();
  return {
    useCase: new UpdatePayoutPolicyUseCase(
      fakePort<IPayoutPolicyStore>({
        save: (_tx, _tenantId, value) => {
          stored.push(value);
          return Promise.resolve(saved);
        },
      }),
      tenantDb.service,
    ),
    tenantDb,
    stored,
  };
}

const input = { holdingDays: 7, minAmount: '250000', cycle: 'weekly' } as PayoutPolicyDto;

describe('UpdatePayoutPolicyUseCase', () => {
  it('stores the normalised policy and echoes the DTO back', async () => {
    const { useCase, tenantDb, stored } = harness();

    await expect(useCase.execute(TENANT_ID, input)).resolves.toEqual(input);
    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(stored).toHaveLength(1);
  });

  it('fails when the tenant row was not there to update', async () => {
    // A silent success would leave the operator believing a dispute window they
    // never actually set.
    const { useCase } = harness(false);

    await expect(useCase.execute(TENANT_ID, input)).rejects.toBeInstanceOf(NotFoundException);
  });
});
