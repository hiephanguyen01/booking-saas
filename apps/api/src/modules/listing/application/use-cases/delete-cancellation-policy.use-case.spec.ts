import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb } from '~testing';
import {
  CancellationPolicyInUse,
  CancellationPolicyNotFound,
  CancellationPolicyNotOwnedForDelete,
} from '../../domain/errors/cancellation-policy-errors';
import type { ICancellationPolicyRepository } from '../../domain/ports/cancellation-policy-repository.port';
import { DeleteCancellationPolicyUseCase } from './delete-cancellation-policy.use-case';

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

function harness(existing: unknown, inUse = 0) {
  const deleted: string[] = [];
  const tenantDb = fakeTenantDb();
  return {
    useCase: new DeleteCancellationPolicyUseCase(
      fakePort<ICancellationPolicyRepository>({
        findById: () => Promise.resolve(existing as never),
        countListingsUsing: () => Promise.resolve(inUse),
        delete: (_tx, id) => {
          deleted.push(id);
          return Promise.resolve();
        },
      }),
      tenantDb.service,
    ),
    tenantDb,
    deleted,
  };
}

describe('DeleteCancellationPolicyUseCase', () => {
  it('answers not-found for a policy this tenant does not have', async () => {
    const { useCase, deleted } = harness(null);

    await expect(useCase.execute(TENANT_ID, PARTNER_ID, POLICY_ID)).rejects.toBeInstanceOf(
      CancellationPolicyNotFound,
    );
    expect(deleted).toEqual([]);
  });

  it('refuses a policy it does not own', async () => {
    const { useCase, deleted } = harness(policy('partner-2'));

    await expect(useCase.execute(TENANT_ID, PARTNER_ID, POLICY_ID)).rejects.toBeInstanceOf(
      CancellationPolicyNotOwnedForDelete,
    );
    expect(deleted).toEqual([]);
  });

  it('refuses while a listing still points at it', async () => {
    // Deleting it would leave those listings with no cancellation terms at all,
    // and a booking snapshots the terms at creation — future bookings would have
    // nothing to snapshot.
    const { useCase, deleted } = harness(policy(PARTNER_ID), 2);

    await expect(useCase.execute(TENANT_ID, PARTNER_ID, POLICY_ID)).rejects.toBeInstanceOf(
      CancellationPolicyInUse,
    );
    expect(deleted).toEqual([]);
  });

  it('deletes an unused policy it owns', async () => {
    const { useCase, tenantDb, deleted } = harness(policy(PARTNER_ID), 0);

    await useCase.execute(TENANT_ID, PARTNER_ID, POLICY_ID);

    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(deleted).toEqual([POLICY_ID]);
  });
});
