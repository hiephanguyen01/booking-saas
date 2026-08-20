import { describe, expect, it } from 'vitest';
import type { PlanLimits } from '@booking/contracts';
import { fakeCollaborator, fakePort } from '~testing';
import { NoActivePlan, PlanLimitReached } from '../../domain/errors/billing-errors';
import type { ITenantRepository } from '../../domain/ports/tenant-repository.port';
import type { GetPlanLimitsUseCase } from './get-plan-limits.use-case';
import { AssertCanAddListingUseCase } from './assert-can-add-listing.use-case';

const LIMITS = { maxPartners: 3, maxListings: 5 } as unknown as PlanLimits;

function harness(current: number, limits: PlanLimits | null = LIMITS) {
  const counted: string[] = [];
  return {
    useCase: new AssertCanAddListingUseCase(
      fakePort<ITenantRepository>({
        countListings: (tenantId) => {
          counted.push(tenantId);
          return Promise.resolve(current);
        },
      }),
      fakeCollaborator<GetPlanLimitsUseCase>({ execute: () => Promise.resolve(limits) }),
    ),
    counted,
  };
}

describe('AssertCanAddListingUseCase', () => {
  it('fails closed when the tenant has no active plan', async () => {
    const { useCase, counted } = harness(0, null);

    await expect(useCase.execute('tenant-1')).rejects.toBeInstanceOf(NoActivePlan);
    expect(counted).toEqual([]);
  });

  it('counts LISTINGS against the listing cap, not partners', async () => {
    // The two asserts are near-identical; crossing the wires would apply the
    // wrong cap to both.
    const { useCase } = harness(4);

    await expect(useCase.execute('tenant-1')).resolves.toBeUndefined();
  });

  it('refuses the create that would exceed the cap', async () => {
    const { useCase } = harness(5);

    const error = await useCase.execute('tenant-1').catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(PlanLimitReached);
    expect((error as Error).message).toBe('Plan limit reached for maxListings (max 5)');
  });
});
