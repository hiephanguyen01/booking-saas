import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb } from '~testing';
import {
  CancellationPolicyNotFound,
  CancellationPolicyNotTenantOwnedForEdit,
} from '../../domain/errors/cancellation-policy-errors';
import type { ICancellationPolicyRepository } from '../../domain/ports/cancellation-policy-repository.port';
import { UpdateTenantCancellationPolicyUseCase } from './update-tenant-cancellation-policy.use-case';

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
    useCase: new UpdateTenantCancellationPolicyUseCase(
      fakePort<ICancellationPolicyRepository>({
        findById: () => Promise.resolve(existing as never),
        update: (_tx, _id, patch) => {
          updates.push(patch);
          return Promise.resolve(policy(null));
        },
        findTenantDefaultId: () => Promise.resolve(null),
      }),
      tenantDb.service,
    ),
    tenantDb,
    updates,
  };
}

const input = { name: 'Chặt chẽ', rules: [{ hoursBefore: 48, refundPercent: 50 }] } as never;

describe('UpdateTenantCancellationPolicyUseCase', () => {
  it('answers not-found for a policy this tenant does not have', async () => {
    const { useCase } = harness(null);

    await expect(useCase.execute(TENANT_ID, POLICY_ID, input)).rejects.toBeInstanceOf(
      CancellationPolicyNotFound,
    );
  });

  it('refuses to edit a PARTNER-owned policy from tenant settings', async () => {
    // The partner wrote it and attaches it to their own listings; the tenant
    // console must not be able to rewrite somebody else's terms.
    const { useCase, updates } = harness(policy(PARTNER_ID));

    await expect(useCase.execute(TENANT_ID, POLICY_ID, input)).rejects.toBeInstanceOf(
      CancellationPolicyNotTenantOwnedForEdit,
    );
    expect(updates).toEqual([]);
  });

  it('applies the change to a tenant-owned policy', async () => {
    const { useCase, tenantDb, updates } = harness(policy(null));

    await useCase.execute(TENANT_ID, POLICY_ID, input);

    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(updates).toHaveLength(1);
  });
});
