import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb } from '~testing';
import { CancellationPolicyNotFound } from '../../domain/errors/cancellation-policy-errors';
import type { ICancellationPolicyRepository } from '../../domain/ports/cancellation-policy-repository.port';
import { GetCancellationPolicyUseCase } from './get-cancellation-policy.use-case';

const TENANT_ID = 'tenant-1';
const PARTNER_ID = 'partner-1';
const POLICY_ID = 'policy-1';

const policy = (partnerId: string | null) =>
  ({
    id: POLICY_ID,
    partnerId,
    tenantId: TENANT_ID,
    name: 'Linh hoạt',
    rules: [],
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  }) as never;

function harness(record: unknown) {
  const tenantDb = fakeTenantDb();
  return {
    useCase: new GetCancellationPolicyUseCase(
      fakePort<ICancellationPolicyRepository>({
        findById: () => Promise.resolve(record as never),
        findPartnerDefaultId: () => Promise.resolve(POLICY_ID),
      }),
      tenantDb.service,
    ),
    tenantDb,
  };
}

describe('GetCancellationPolicyUseCase', () => {
  it('reads the partner own policy', async () => {
    const { useCase, tenantDb } = harness(policy(PARTNER_ID));

    await expect(useCase.execute(TENANT_ID, PARTNER_ID, POLICY_ID)).resolves.toMatchObject({
      id: POLICY_ID,
      isDefault: true,
    });
    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
  });

  it('reads a shared tenant-level policy', async () => {
    const { useCase } = harness(policy(null));

    await expect(useCase.execute(TENANT_ID, PARTNER_ID, POLICY_ID)).resolves.toMatchObject({
      id: POLICY_ID,
    });
  });

  it("reports another partner's policy as not-found, never as forbidden", async () => {
    // A distinguishable error would confirm the policy exists on a neighbour.
    const { useCase } = harness(policy('partner-2'));

    await expect(useCase.execute(TENANT_ID, PARTNER_ID, POLICY_ID)).rejects.toBeInstanceOf(
      CancellationPolicyNotFound,
    );
  });

  it('answers not-found for a policy this tenant does not have', async () => {
    const { useCase } = harness(null);

    await expect(useCase.execute(TENANT_ID, PARTNER_ID, POLICY_ID)).rejects.toBeInstanceOf(
      CancellationPolicyNotFound,
    );
  });
});
