import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb } from '~testing';
import {
  CancellationPolicyNotFound,
  CancellationPolicyNotOwnedForEdit,
} from '../../domain/errors/cancellation-policy-errors';
import type { ICancellationPolicyRepository } from '../../domain/ports/cancellation-policy-repository.port';
import { UpdateCancellationPolicyUseCase } from './update-cancellation-policy.use-case';

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

function harness(existing: unknown) {
  const updates: unknown[] = [];
  const tenantDb = fakeTenantDb();
  return {
    useCase: new UpdateCancellationPolicyUseCase(
      fakePort<ICancellationPolicyRepository>({
        findById: () => Promise.resolve(existing as never),
        update: (_tx, _id, patch) => {
          updates.push(patch);
          return Promise.resolve(policy(PARTNER_ID));
        },
        findPartnerDefaultId: () => Promise.resolve(null),
      }),
      tenantDb.service,
    ),
    tenantDb,
    updates,
  };
}

const input = { name: 'Chặt chẽ', rules: [{ hoursBefore: 48, refundPercent: 50 }] } as never;

describe('UpdateCancellationPolicyUseCase', () => {
  it('answers not-found for a policy this tenant does not have', async () => {
    const { useCase } = harness(null);

    await expect(useCase.execute(TENANT_ID, PARTNER_ID, POLICY_ID, input)).rejects.toBeInstanceOf(
      CancellationPolicyNotFound,
    );
  });

  it("refuses to edit another partner's policy", async () => {
    const { useCase, updates } = harness(policy('partner-2'));

    await expect(useCase.execute(TENANT_ID, PARTNER_ID, POLICY_ID, input)).rejects.toBeInstanceOf(
      CancellationPolicyNotOwnedForEdit,
    );
    expect(updates).toEqual([]);
  });

  it('refuses to edit a shared tenant-level policy', async () => {
    // Read-only to a partner: editing it would change the terms for every other
    // partner attached to it.
    const { useCase } = harness(policy(null));

    await expect(useCase.execute(TENANT_ID, PARTNER_ID, POLICY_ID, input)).rejects.toBeInstanceOf(
      CancellationPolicyNotOwnedForEdit,
    );
  });

  it('applies the change to the partner own policy', async () => {
    const { useCase, tenantDb, updates } = harness(policy(PARTNER_ID));

    await useCase.execute(TENANT_ID, PARTNER_ID, POLICY_ID, input);

    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(updates).toHaveLength(1);
  });
});
