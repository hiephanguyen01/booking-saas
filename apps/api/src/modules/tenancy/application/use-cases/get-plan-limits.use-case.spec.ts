import { describe, expect, it } from 'vitest';
import type { PlanLimits } from '@booking/contracts';
import { fakePort } from '~testing';
import type { ICurrentSubscriptionReader } from '../../domain/ports/current-subscription-reader.port';
import type { SubscriptionSnapshot } from '../../domain/subscription-status';
import { GetPlanLimitsUseCase } from './get-plan-limits.use-case';

const NOW = new Date('2026-08-19T00:00:00Z');

const LIMITS = {
  maxPartners: 10,
  maxListings: 100,
  maxBookingsPerMonth: 1000,
  customDomain: true,
  affiliateModule: false,
} as unknown as PlanLimits;

const subscription = (overrides: Partial<SubscriptionSnapshot> = {}): SubscriptionSnapshot => ({
  status: 'active',
  startsAt: new Date('2026-01-01T00:00:00Z'),
  expiresAt: new Date('2026-12-31T00:00:00Z'),
  ...overrides,
});

function harness(sub: SubscriptionSnapshot | null = subscription()) {
  const asked: string[] = [];
  return {
    useCase: new GetPlanLimitsUseCase(
      fakePort<ICurrentSubscriptionReader>({
        findByTenant: (tenantId) => {
          asked.push(tenantId);
          return Promise.resolve({
            current: sub === null ? null : ({ subscription: sub, plan: { limits: LIMITS } } as never),
            evaluatedAt: NOW,
          });
        },
      }),
    ),
    asked,
  };
}

describe('GetPlanLimitsUseCase', () => {
  it("answers the active plan's limits", async () => {
    const { useCase, asked } = harness();

    await expect(useCase.execute('tenant-1')).resolves.toBe(LIMITS);
    expect(asked).toEqual(['tenant-1']);
  });

  it('answers null when the tenant has no subscription', async () => {
    const { useCase } = harness(null);

    await expect(useCase.execute('tenant-1')).resolves.toBeNull();
  });

  it('answers null once the subscription has LAPSED', async () => {
    // The plan's caps stop applying with it — every consumer of this fails
    // closed on null rather than keeping the old allowance.
    const { useCase } = harness(subscription({ expiresAt: new Date('2026-08-01T00:00:00Z') }));

    await expect(useCase.execute('tenant-1')).resolves.toBeNull();
  });

  it('answers null in the grace period too, not just after it', async () => {
    // Grace honours existing bookings; it does not keep granting new capacity.
    const { useCase } = harness(subscription({ expiresAt: new Date('2026-08-18T00:00:00Z') }));

    await expect(useCase.execute('tenant-1')).resolves.toBeNull();
  });

  it('answers null for a cancelled subscription still inside its term', async () => {
    const { useCase } = harness(subscription({ status: 'cancelled' }));

    await expect(useCase.execute('tenant-1')).resolves.toBeNull();
  });

  it('still answers for a TRIAL and for a past_due subscription in term', async () => {
    // Both are billable states — a trial tenant has a plan, and dunning is not
    // expiry.
    await expect(harness(subscription({ status: 'trial' })).useCase.execute('t')).resolves.toBe(
      LIMITS,
    );
    await expect(harness(subscription({ status: 'past_due' })).useCase.execute('t')).resolves.toBe(
      LIMITS,
    );
  });
});
