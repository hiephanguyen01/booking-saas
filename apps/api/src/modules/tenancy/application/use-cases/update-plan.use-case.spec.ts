import { describe, expect, it } from 'vitest';
import type { PlanLimits, UpdatePlanInput } from '@booking/contracts';
import { fakePort } from '~testing';
import {
  PlanNameTaken,
  PlanNotFound,
  PlanRepricingNeedsConfirmation,
} from '../../domain/errors/billing-errors';
import type { SubscriptionPlanPatch } from '../../domain/entities/subscription-plan.entity';
import type { ICurrentSubscriptionReader } from '../../domain/ports/current-subscription-reader.port';
import type { IPlanRepository, PlanRecord } from '../../domain/ports/plan-repository.port';
import { UpdatePlanUseCase } from './update-plan.use-case';

const PLAN_ID = 'plan-1';
const LIMITS = { maxPartners: 10 } as unknown as PlanLimits;

const plan = (overrides: Partial<PlanRecord> = {}): PlanRecord =>
  ({
    id: PLAN_ID,
    name: 'Gói Chuyên nghiệp',
    priceMonthly: 990000n,
    limits: LIMITS,
    isActive: true,
    ...overrides,
  }) as PlanRecord;

interface Options {
  found?: PlanRecord | null;
  clash?: PlanRecord | null;
  subscribers?: number;
}

function harness(options: Options = {}) {
  const patches: SubscriptionPlanPatch[] = [];
  const nameLookups: string[] = [];
  return {
    useCase: new UpdatePlanUseCase(
      fakePort<IPlanRepository>({
        findById: () => Promise.resolve(options.found === undefined ? plan() : options.found),
        findByName: (name) => {
          nameLookups.push(name);
          return Promise.resolve(options.clash ?? null);
        },
        update: (id, patch) => {
          patches.push(patch);
          return Promise.resolve({ ...plan(), id, ...patch } as PlanRecord);
        },
      }),
      fakePort<ICurrentSubscriptionReader>({
        // A decoy plan with a DIFFERENT count: taking the first value of the map
        // instead of looking this plan up would silently pass otherwise.
        liveSubscriberCounts: () =>
          Promise.resolve(
            new Map([
              ['plan-decoy', 42],
              [PLAN_ID, options.subscribers ?? 0],
            ]),
          ),
      }),
    ),
    patches,
    nameLookups,
  };
}

const input = (overrides: Partial<UpdatePlanInput> = {}) => overrides as UpdatePlanInput;

describe('UpdatePlanUseCase', () => {
  it('answers not-found for an unknown plan', async () => {
    const { useCase, patches } = harness({ found: null });

    await expect(useCase.execute(PLAN_ID, input({ name: 'Mới' }))).rejects.toBeInstanceOf(
      PlanNotFound,
    );
    expect(patches).toEqual([]);
  });

  it('refuses a name another plan already holds', async () => {
    // `name` is UNIQUE; pre-checking is what keeps a raw Prisma constraint error
    // from escaping to the caller.
    const { useCase, patches } = harness({ clash: plan({ id: 'plan-2' }) });

    await expect(useCase.execute(PLAN_ID, input({ name: 'Gói Khác' }))).rejects.toBeInstanceOf(
      PlanNameTaken,
    );
    expect(patches).toEqual([]);
  });

  it('does not look the name up when it is unchanged', async () => {
    // Otherwise re-submitting the form would report the plan as clashing with
    // itself.
    const { useCase, nameLookups, patches } = harness({ clash: plan() });

    await useCase.execute(PLAN_ID, input({ name: 'Gói Chuyên nghiệp' }));

    expect(nameLookups).toEqual([]);
    expect(patches).toHaveLength(1);
  });

  it('REFUSES a price change on a plan with live subscribers', async () => {
    // There is no price snapshot column, so a price edit re-prices every tenant
    // already on the plan. The refusal names the count.
    const { useCase, patches } = harness({ subscribers: 3 });

    const error = await useCase
      .execute(PLAN_ID, input({ priceMonthly: '1490000' }))
      .catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(PlanRepricingNeedsConfirmation);
    expect((error as Error).message).toContain('3');
    expect(patches).toEqual([]);
  });

  it('allows the re-price once the caller confirms the blast radius', async () => {
    const { useCase, patches } = harness({ subscribers: 3 });

    await useCase.execute(
      PLAN_ID,
      input({ priceMonthly: '1490000', repriceExistingSubscribers: true }),
    );

    expect(patches[0]?.priceMonthly).toBe(1490000n);
  });

  it('needs no confirmation on a plan nobody has bought', async () => {
    // Fixing a typo on an unsold plan is the common case and must just work.
    const { useCase, patches } = harness({ subscribers: 0 });

    await useCase.execute(PLAN_ID, input({ priceMonthly: '1490000' }));

    expect(patches[0]?.priceMonthly).toBe(1490000n);
  });

  it('treats re-submitting the SAME price as no re-price at all', async () => {
    const { useCase, patches } = harness({ subscribers: 3 });

    await useCase.execute(PLAN_ID, input({ priceMonthly: '990000' }));

    expect(patches).toHaveLength(1);
  });

  it('never gates a limits or isActive edit', async () => {
    // Limits track the plan's current caps, and deactivating only hides it from
    // new assignment — neither disturbs an existing subscriber.
    const { useCase, patches } = harness({ subscribers: 3 });

    await useCase.execute(PLAN_ID, input({ limits: LIMITS, isActive: false }));

    expect(patches).toEqual([
      { name: undefined, priceMonthly: undefined, limits: LIMITS, isActive: false },
    ]);
  });

  it('parses the new price as bigint', async () => {
    const { useCase, patches } = harness();

    await useCase.execute(PLAN_ID, input({ priceMonthly: '9007199254740993' }));

    expect(patches[0]?.priceMonthly).toBe(9007199254740993n);
  });

  it('returns the subscriber count alongside the updated plan', async () => {
    // Editing a plan cannot add or drop subscribers, so the count still holds.
    const { useCase } = harness({ subscribers: 3 });

    const result = await useCase.execute(PLAN_ID, input({ isActive: false }));

    expect(result).toMatchObject({ subscriberCount: 3 });
  });

  it('reports zero for a plan absent from the counts map', async () => {
    const { useCase } = harness({ found: plan({ id: 'plan-9' }) });

    const result = await useCase.execute('plan-9', input({ isActive: false }));

    expect(result.subscriberCount).toBe(0);
  });
});
