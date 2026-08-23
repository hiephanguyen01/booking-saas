import { describe, expect, it } from 'vitest';
import type { UpdateTenantRefundPolicyInput } from '@booking/contracts';
import { fakePort, fakeTenantContext, fakeTenantDb } from '~testing';
import type { PaymentConfigurationLockPort } from '../../domain/ports/payment-configuration-lock.port';
import type { IRefundPolicyRepository } from '../../domain/ports/refund-policy-repository.port';
import { InvalidRefundPolicy } from '../payment-http-errors';
import { UpdateRefundPolicyUseCase } from './update-refund-policy.use-case';

const TENANT_ID = 'tenant-1';
const ACTOR_ID = 'user-1';

function harness() {
  const tenantDb = fakeTenantDb();
  const calls: string[] = [];
  const writes: unknown[] = [];
  const useCase = new UpdateRefundPolicyUseCase(
    fakePort<IRefundPolicyRepository>({
      upsert: (_tx, tenantId, policy, actorId) => {
        calls.push('upsert');
        writes.push({ tenantId, policy, actorId });
        return Promise.resolve(policy);
      },
    }),
    fakePort<PaymentConfigurationLockPort>({
      acquire: () => {
        calls.push('lock');
        return Promise.resolve();
      },
    }),
    fakeTenantContext(TENANT_ID),
    tenantDb.service,
  );
  return { useCase, calls, writes, tenantDb };
}

describe('UpdateRefundPolicyUseCase', () => {
  it('locks and writes the validated tenant policy with the actor id', async () => {
    const { useCase, calls, writes, tenantDb } = harness();
    const input: UpdateTenantRefundPolicyInput = {
      refundStrategy: 'automatic_preferred',
      manualRefundSlaHours: 72,
    };

    await expect(useCase.execute(input, ACTOR_ID)).resolves.toEqual(input);
    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(calls).toEqual(['lock', 'upsert']);
    expect(writes).toEqual([{ tenantId: TENANT_ID, policy: input, actorId: ACTOR_ID }]);
  });

  it('rejects an invalid SLA before opening a tenant transaction', () => {
    const { useCase, tenantDb } = harness();
    expect(() =>
      useCase.execute(
        { refundStrategy: 'manual', manualRefundSlaHours: 0 } as UpdateTenantRefundPolicyInput,
        ACTOR_ID,
      ),
    ).toThrow(InvalidRefundPolicy);
    expect(tenantDb.openedFor).toEqual([]);
  });
});
