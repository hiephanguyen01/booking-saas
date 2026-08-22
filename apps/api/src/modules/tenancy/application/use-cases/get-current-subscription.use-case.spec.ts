import { describe, expect, it } from 'vitest';
import { fakePort } from '~testing';
import type { ICurrentSubscriptionReader } from '../../domain/ports/current-subscription-reader.port';
import { GetCurrentSubscriptionUseCase } from './get-current-subscription.use-case';

const NOW = new Date('2026-08-19T00:00:00Z');
const SUBSCRIPTION = { id: 'sub-1', status: 'active' };
const PLAN = { id: 'plan-1', name: 'Chuyên nghiệp' };

function harness(options: { hasCurrent?: boolean; counts?: Map<string, number> } = {}) {
  const asked: string[] = [];
  return {
    useCase: new GetCurrentSubscriptionUseCase(
      fakePort<ICurrentSubscriptionReader>({
        findByTenant: (tenantId) => {
          asked.push(tenantId);
          return Promise.resolve({
            current:
              options.hasCurrent === false
                ? null
                : ({ subscription: SUBSCRIPTION, plan: PLAN } as never),
            evaluatedAt: NOW,
          });
        },
        liveSubscriberCounts: () =>
          Promise.resolve(
            options.counts ??
              new Map([
                ['plan-decoy', 99],
                ['plan-1', 7],
              ]),
          ),
      }),
    ),
    asked,
  };
}

describe('GetCurrentSubscriptionUseCase', () => {
  it('answers null for a tenant that has never been subscribed', async () => {
    const { useCase } = harness({ hasCurrent: false });

    await expect(useCase.execute('tenant-1')).resolves.toBeNull();
  });

  it("carries the DATABASE clock the selection was made against", async () => {
    // Liveness is evaluated against it; substituting an app clock would let a
    // skewed host decide whether a tenant is live.
    const { useCase, asked } = harness();

    const result = await useCase.execute('tenant-1');

    expect(asked).toEqual(['tenant-1']);
    expect(result?.evaluatedAt).toBe(NOW);
  });

  it("attaches the subscriber count of THIS plan", async () => {
    const { useCase } = harness();

    const result = await useCase.execute('tenant-1');

    expect(result).toMatchObject({
      subscription: SUBSCRIPTION,
      plan: { plan: PLAN, subscriberCount: 7 },
    });
  });

  it('reports zero for a plan absent from the counts', async () => {
    const { useCase } = harness({ counts: new Map() });

    const result = await useCase.execute('tenant-1');

    expect(result?.plan.subscriberCount).toBe(0);
  });
});
