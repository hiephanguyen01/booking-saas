import { describe, expect, it } from 'vitest';
import { fakePort } from '~testing';
import type { ICurrentSubscriptionReader } from '../../domain/ports/current-subscription-reader.port';
import type { IPlanRepository, PlanRecord } from '../../domain/ports/plan-repository.port';
import { ListPlansUseCase } from './list-plans.use-case';

const PLANS = [
  { id: 'plan-1', name: 'Cơ bản' },
  { id: 'plan-2', name: 'Chuyên nghiệp' },
] as PlanRecord[];

function harness(counts: Map<string, number>) {
  let listCalls = 0;
  let countCalls = 0;
  return {
    useCase: new ListPlansUseCase(
      fakePort<IPlanRepository>({
        list: () => {
          listCalls += 1;
          return Promise.resolve(PLANS);
        },
      }),
      fakePort<ICurrentSubscriptionReader>({
        liveSubscriberCounts: () => {
          countCalls += 1;
          return Promise.resolve(counts);
        },
      }),
    ),
    calls: () => ({ listCalls, countCalls }),
  };
}

describe('ListPlansUseCase', () => {
  it('pairs each plan with its live subscriber count', async () => {
    const { useCase } = harness(new Map([['plan-1', 4]]));

    const result = await useCase.execute();

    expect(result).toEqual([
      { plan: PLANS[0], subscriberCount: 4 },
      { plan: PLANS[1], subscriberCount: 0 },
    ]);
  });

  it('takes the counts as ONE grouped aggregate, not a query per plan', async () => {
    // MRR is derived from these; a per-plan query would make the admin board
    // scale with the plan count.
    const { useCase, calls } = harness(new Map());

    await useCase.execute();

    expect(calls()).toEqual({ listCalls: 1, countCalls: 1 });
  });
});
