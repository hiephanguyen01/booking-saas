import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb } from '~testing';
import type { ICancellationPolicyRepository } from '../../domain/ports/cancellation-policy-repository.port';
import { CreateCancellationPolicyUseCase } from './create-cancellation-policy.use-case';

const TENANT_ID = 'tenant-1';
const PARTNER_ID = 'partner-1';
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

describe('CreateCancellationPolicyUseCase', () => {
  it('forces the owner to the partner in scope, never taking it from the body', async () => {
    // A partner-supplied `partnerId` would let one partner create a policy owned
    // by another — or a tenant-level one it has no right to.
    const created: unknown[] = [];
    const tenantDb = fakeTenantDb();
    const useCase = new CreateCancellationPolicyUseCase(
      fakePort<ICancellationPolicyRepository>({
        create: (_tx, _tenantId, data) => {
          created.push(data);
          return Promise.resolve(policy(PARTNER_ID));
        },
        findPartnerDefaultId: () => Promise.resolve(null),
      }),
      tenantDb.service,
    );

    await useCase.execute(TENANT_ID, PARTNER_ID, {
      name: 'Linh hoạt',
      rules: [{ hoursBefore: 24, refundPercent: 100 }],
      partnerId: 'partner-2',
    } as never);

    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(created).toEqual([
      {
        partnerId: PARTNER_ID,
        name: 'Linh hoạt',
        rules: [{ hoursBefore: 24, refundPercent: 100 }],
      },
    ]);
  });
});
