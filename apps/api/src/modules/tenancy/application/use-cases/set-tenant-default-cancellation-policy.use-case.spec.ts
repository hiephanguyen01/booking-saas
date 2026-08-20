import { describe, expect, it } from 'vitest';
import { fakePort } from '~testing';
import { TenantNotFound } from '../../../../shared/domain/errors/tenant-not-found';
import { InvalidCancellationPolicy } from '../../domain/errors/tenancy-errors';
import type { ITenantRepository, TenantRecord } from '../../domain/ports/tenant-repository.port';
import { SetTenantDefaultCancellationPolicyUseCase } from './set-tenant-default-cancellation-policy.use-case';

const TENANT_ID = 'tenant-1';

const tenant = () =>
  ({
    id: TENANT_ID,
    status: 'active',
    settings: {},
    defaultCancellationPolicyId: 'policy-old',
  }) as TenantRecord;

function harness(options: { found?: TenantRecord | null; isTenantLevel?: boolean } = {}) {
  const patches: Record<string, unknown>[] = [];
  const ownershipChecks: Array<{ tenantId: string; policyId: string }> = [];
  return {
    useCase: new SetTenantDefaultCancellationPolicyUseCase(
      fakePort<ITenantRepository>({
        findById: () => Promise.resolve(options.found === undefined ? tenant() : options.found),
        isTenantLevelPolicy: (tenantId, policyId) => {
          ownershipChecks.push({ tenantId, policyId });
          return Promise.resolve(options.isTenantLevel ?? true);
        },
        update: (id, patch) => {
          patches.push(patch as Record<string, unknown>);
          return Promise.resolve({ id, ...patch } as TenantRecord);
        },
      }),
    ),
    patches,
    ownershipChecks,
  };
}

describe('SetTenantDefaultCancellationPolicyUseCase', () => {
  it('answers not-found for an unknown tenant', async () => {
    const { useCase, patches } = harness({ found: null });

    await expect(useCase.execute(TENANT_ID, 'policy-1')).rejects.toBeInstanceOf(TenantNotFound);
    expect(patches).toEqual([]);
  });

  it("REFUSES a policy that is not this tenant's own tenant-level one", async () => {
    // A partner-level policy, or another tenant's, would become the fallback
    // every booking without its own policy falls back to.
    const { useCase, patches, ownershipChecks } = harness({ isTenantLevel: false });

    await expect(useCase.execute(TENANT_ID, 'policy-1')).rejects.toBeInstanceOf(
      InvalidCancellationPolicy,
    );
    expect(ownershipChecks).toEqual([{ tenantId: TENANT_ID, policyId: 'policy-1' }]);
    expect(patches).toEqual([]);
  });

  it('sets a valid tenant-level policy', async () => {
    const { useCase, patches } = harness();

    await useCase.execute(TENANT_ID, 'policy-1');

    expect(patches).toEqual([{ defaultCancellationPolicyId: 'policy-1' }]);
  });

  it('CLEARS the default without an ownership check — there is nothing to own', async () => {
    const { useCase, patches, ownershipChecks } = harness({ isTenantLevel: false });

    await useCase.execute(TENANT_ID, null);

    expect(ownershipChecks).toEqual([]);
    expect(patches).toEqual([{ defaultCancellationPolicyId: null }]);
  });
});
