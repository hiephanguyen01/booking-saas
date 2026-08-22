import { describe, expect, it } from 'vitest';
import type { CreatePlanInput, PlanLimits } from '@booking/contracts';
import { fakePort } from '~testing';
import type {
  IPlanRepository,
  PlanRecord,
} from '../../domain/ports/plan-repository.port';
import type { NewSubscriptionPlan } from '../../domain/entities/subscription-plan.entity';
import { CreatePlanUseCase } from './create-plan.use-case';

const LIMITS = { maxPartners: 10 } as unknown as PlanLimits;

function harness() {
  const created: NewSubscriptionPlan[] = [];
  return {
    useCase: new CreatePlanUseCase(
      fakePort<IPlanRepository>({
        create: (plan) => {
          created.push(plan);
          return Promise.resolve({ id: 'plan-1', ...plan } as PlanRecord);
        },
      }),
    ),
    created,
  };
}

const input = (overrides: Partial<CreatePlanInput> = {}) =>
  ({
    name: 'Gói Chuyên nghiệp',
    priceMonthly: '990000',
    limits: LIMITS,
    isActive: true,
    ...overrides,
  }) as CreatePlanInput;

describe('CreatePlanUseCase', () => {
  it('parses the price as BIGINT, not Number', async () => {
    // A VND price can exceed 2^53; parsing through Number would silently round
    // it, and the plan would bill the wrong amount forever.
    const { useCase, created } = harness();

    await useCase.execute(input({ priceMonthly: '9007199254740993' }));

    expect(created[0]?.priceMonthly).toBe(9007199254740993n);
  });

  it('stores the name, limits and active flag as submitted', async () => {
    const { useCase, created } = harness();

    const result = await useCase.execute(input({ isActive: false }));

    expect(created).toEqual([
      {
        name: 'Gói Chuyên nghiệp',
        priceMonthly: 990000n,
        limits: LIMITS,
        isActive: false,
      },
    ]);
    expect(result).toMatchObject({ id: 'plan-1' });
  });
});
