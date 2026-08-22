import { describe, expect, it } from 'vitest';
import type { PlanLimits } from '@booking/contracts';
import { fakeCollaborator } from '~testing';
import { NoActivePlan, PlanFeatureDisabled } from '../../domain/errors/billing-errors';
import type { GetPlanLimitsUseCase } from './get-plan-limits.use-case';
import { AssertCustomDomainAllowedUseCase } from './assert-custom-domain-allowed.use-case';

function harness(limits: PlanLimits | null) {
  const asked: string[] = [];
  return {
    useCase: new AssertCustomDomainAllowedUseCase(
      fakeCollaborator<GetPlanLimitsUseCase>({
        execute: (tenantId: unknown) => {
          asked.push(tenantId as string);
          return Promise.resolve(limits);
        },
      }),
    ),
    asked,
  };
}

describe('AssertCustomDomainAllowedUseCase', () => {
  it('fails closed when the tenant has no active plan', async () => {
    const { useCase } = harness(null);

    await expect(useCase.execute('tenant-1')).rejects.toBeInstanceOf(NoActivePlan);
  });

  it('refuses when the plan does not include custom domains', async () => {
    const { useCase, asked } = harness({ customDomain: false } as unknown as PlanLimits);

    await expect(useCase.execute('tenant-1')).rejects.toBeInstanceOf(PlanFeatureDisabled);
    expect(asked).toEqual(['tenant-1']);
  });

  it('requires the flag to be exactly TRUE, not merely truthy', async () => {
    // The limits blob is JSON from the database; a string "yes" is not a
    // purchased feature.
    const { useCase } = harness({ customDomain: 'yes' } as unknown as PlanLimits);

    await expect(useCase.execute('tenant-1')).rejects.toBeInstanceOf(PlanFeatureDisabled);
  });

  it('allows it when the plan includes it', async () => {
    const { useCase } = harness({ customDomain: true } as unknown as PlanLimits);

    await expect(useCase.execute('tenant-1')).resolves.toBeUndefined();
  });
});
