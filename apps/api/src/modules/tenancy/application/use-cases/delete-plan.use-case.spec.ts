import { describe, expect, it } from 'vitest';
import { fakePort } from '~testing';
import {
  PlanHasLiveSubscribers,
  PlanHasSubscriptionHistory,
  PlanNotFound,
} from '../../domain/errors/billing-errors';
import type { ICurrentSubscriptionReader } from '../../domain/ports/current-subscription-reader.port';
import type { IPlanRepository, PlanRecord } from '../../domain/ports/plan-repository.port';
import { DeletePlanUseCase } from './delete-plan.use-case';

const PLAN_ID = 'plan-1';

const plan = () =>
  ({ id: PLAN_ID, name: 'Gói Chuyên nghiệp', priceMonthly: 990000n } as PlanRecord);

function harness(options: { found?: PlanRecord | null; live?: number; total?: number } = {}) {
  const deleted: string[] = [];
  return {
    useCase: new DeletePlanUseCase(
      fakePort<IPlanRepository>({
        findById: () => Promise.resolve(options.found === undefined ? plan() : options.found),
        countSubscriptions: () => Promise.resolve(options.total ?? 0),
        delete: (id) => {
          deleted.push(id);
          return Promise.resolve();
        },
      }),
      fakePort<ICurrentSubscriptionReader>({
        liveSubscriberCounts: () => Promise.resolve(new Map([[PLAN_ID, options.live ?? 0]])),
      }),
    ),
    deleted,
  };
}

describe('DeletePlanUseCase', () => {
  it('answers not-found for an unknown plan', async () => {
    const { useCase, deleted } = harness({ found: null });

    await expect(useCase.execute(PLAN_ID)).rejects.toBeInstanceOf(PlanNotFound);
    expect(deleted).toEqual([]);
  });

  it('REFUSES to delete a plan a paying tenant is on', async () => {
    // Dropping the plan out from under them would strip their limits and their
    // price at once.
    const { useCase, deleted } = harness({ live: 2, total: 5 });

    const error = await useCase.execute(PLAN_ID).catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(PlanHasLiveSubscribers);
    expect((error as Error).message).toContain('2');
    expect(deleted).toEqual([]);
  });

  it('reports LIVE subscribers before history — that is the actionable one', async () => {
    // "Migrate them first" is something the operator can do; "the FK is
    // RESTRICT" is not.
    const { useCase } = harness({ live: 2, total: 5 });

    await expect(useCase.execute(PLAN_ID)).rejects.toBeInstanceOf(PlanHasLiveSubscribers);
  });

  it('refuses a plan with only historical subscriptions', async () => {
    // The FK is RESTRICT: removing the row would take the billing trail with it.
    // Deactivating is the correct move.
    const { useCase, deleted } = harness({ live: 0, total: 5 });

    await expect(useCase.execute(PLAN_ID)).rejects.toBeInstanceOf(PlanHasSubscriptionHistory);
    expect(deleted).toEqual([]);
  });

  it('deletes a plan nothing references', async () => {
    const { useCase, deleted } = harness({ live: 0, total: 0 });

    await useCase.execute(PLAN_ID);

    expect(deleted).toEqual([PLAN_ID]);
  });
});
