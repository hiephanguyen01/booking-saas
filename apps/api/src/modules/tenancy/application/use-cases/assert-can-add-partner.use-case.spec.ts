import { describe, expect, it } from 'vitest';
import type { PlanLimits } from '@booking/contracts';
import { fakeCollaborator, fakePort } from '~testing';
import { NoActivePlan, PlanLimitReached } from '../../domain/errors/billing-errors';
import type { ITenantRepository } from '../../domain/ports/tenant-repository.port';
import type { GetPlanLimitsUseCase } from './get-plan-limits.use-case';
import { AssertCanAddPartnerUseCase } from './assert-can-add-partner.use-case';

const LIMITS = { maxPartners: 3, maxListings: 100 } as unknown as PlanLimits;

function harness(current: number, limits: PlanLimits | null = LIMITS) {
  const counted: string[] = [];
  return {
    useCase: new AssertCanAddPartnerUseCase(
      fakePort<ITenantRepository>({
        countPartners: (tenantId) => {
          counted.push(tenantId);
          return Promise.resolve(current);
        },
      }),
      fakeCollaborator<GetPlanLimitsUseCase>({ execute: () => Promise.resolve(limits) }),
    ),
    counted,
  };
}

describe('AssertCanAddPartnerUseCase', () => {
  it('FAILS CLOSED when the tenant has no active plan', async () => {
    // No plan means no allowance — treating it as unlimited would let a lapsed
    // tenant keep growing.
    const { useCase, counted } = harness(0, null);

    await expect(useCase.execute('tenant-1')).rejects.toBeInstanceOf(NoActivePlan);
    expect(counted).toEqual([]);
  });

  it('allows a create while strictly below the cap', async () => {
    const { useCase, counted } = harness(2);

    await expect(useCase.execute('tenant-1')).resolves.toBeUndefined();
    expect(counted).toEqual(['tenant-1']);
  });

  it('refuses the create that would EXCEED the cap', async () => {
    // At 3 of 3 the next one is the fourth; `current < limit` is the boundary.
    const { useCase } = harness(3);

    // The message names which cap was hit — it is the only place that survives
    // to the operator, since this error carries no structured details.
    const error = await useCase.execute('tenant-1').catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(PlanLimitReached);
    expect((error as Error).message).toBe('Plan limit reached for maxPartners (max 3)');
  });

  it('refuses once already over the cap', async () => {
    const { useCase } = harness(4);

    await expect(useCase.execute('tenant-1')).rejects.toBeInstanceOf(PlanLimitReached);
  });
});
