import { describe, expect, it } from 'vitest';
import { fakePort } from '~testing';
import type { ICurrentSubscriptionReader } from '../../domain/ports/current-subscription-reader.port';
import type {
  IPlatformHealthReader,
  PlatformHealthFacts,
  TenantHealthFactsRow,
} from '../../domain/ports/platform-health-reader.port';
import type { SubscriptionState } from '../../domain/subscription-status';
import { GetPlatformHealthUseCase } from './get-platform-health.use-case';

const NOW = new Date('2026-08-19T00:00:00Z');

const tenantFacts = (overrides: Partial<TenantHealthFactsRow> = {}): TenantHealthFactsRow => ({
  id: 'tenant-1',
  name: 'StudioHub',
  slug: 'studiohub',
  status: 'active',
  vertical: 'studio',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  gmv: 1_000_000n,
  gmv30d: 200_000n,
  bookings30d: 5,
  firstBookingAt: null,
  publishedListings: 10,
  ...overrides,
});

const facts = (overrides: Partial<PlatformHealthFacts> = {}): PlatformHealthFacts => ({
  tenants: [tenantFacts()],
  webhookFailures: [],
  overduePayouts: [],
  gmvTrend: [{ date: '2026-08-18', gmv: 50_000n }],
  webhookFailureTotal: 0,
  ...overrides,
});

interface Sub {
  tenantId: string;
  status?: SubscriptionState;
  expiresAt?: Date;
  planName?: string;
  priceMonthly?: bigint;
}

const subscriptionItem = (s: Sub) =>
  ({
    subscription: {
      tenantId: s.tenantId,
      status: s.status ?? 'active',
      startsAt: new Date('2026-01-01T00:00:00Z'),
      expiresAt: s.expiresAt ?? new Date('2026-12-31T00:00:00Z'),
    },
    plan: { name: s.planName ?? 'Chuyên nghiệp', priceMonthly: s.priceMonthly ?? 990_000n },
  }) as never;

function harness(options: { facts?: PlatformHealthFacts; subs?: Sub[] } = {}) {
  return new GetPlatformHealthUseCase(
    fakePort<IPlatformHealthReader>({
      read: () => Promise.resolve(options.facts ?? facts()),
    }),
    fakePort<ICurrentSubscriptionReader>({
      listCurrent: () =>
        Promise.resolve({
          items: (options.subs ?? [{ tenantId: 'tenant-1' }]).map(subscriptionItem),
          evaluatedAt: NOW,
        }),
    }),
  );
}

describe('GetPlatformHealthUseCase', () => {
  it('sums GMV as bigint, never through a float', async () => {
    // VND amounts exceed 2^53; a Number sum would round the platform's headline
    // figure.
    const useCase = harness({
      facts: facts({
        tenants: [
          tenantFacts({ id: 'a', gmv: 9_007_199_254_740_993n, gmv30d: 1n }),
          tenantFacts({ id: 'b', gmv: 1n, gmv30d: 2n }),
        ],
      }),
      subs: [],
    });

    const result = await useCase.execute();

    expect(result.kpis.gmvAllTime).toBe(9_007_199_254_740_994n);
    expect(result.kpis.gmv30d).toBe(3n);
  });

  it('counts MRR from LIVE subscriptions only', async () => {
    // MRR is the platform's own revenue; a lapsed subscription contributes
    // nothing to it.
    const useCase = harness({
      facts: facts({ tenants: [tenantFacts({ id: 'a' }), tenantFacts({ id: 'b' })] }),
      subs: [
        { tenantId: 'a', priceMonthly: 990_000n },
        { tenantId: 'b', priceMonthly: 500_000n, expiresAt: new Date('2026-08-01T00:00:00Z') },
      ],
    });

    const result = await useCase.execute();

    expect(result.kpis.mrr).toBe(990_000n);
  });

  it('counts a TRIAL subscription towards MRR — it is a billable state', async () => {
    const useCase = harness({ subs: [{ tenantId: 'tenant-1', status: 'trial' }] });

    const result = await useCase.execute();

    expect(result.kpis.mrr).toBe(990_000n);
  });

  it('excludes a cancelled subscription from MRR even inside its term', async () => {
    const useCase = harness({ subs: [{ tenantId: 'tenant-1', status: 'cancelled' }] });

    const result = await useCase.execute();

    expect(result.kpis.mrr).toBe(0n);
  });

  it('evaluates liveness against the DATABASE clock from the snapshot', async () => {
    // Every row shares one transaction timestamp; an app clock could disagree
    // with the lifecycle the tenant actually experiences.
    const useCase = harness({
      subs: [{ tenantId: 'tenant-1', expiresAt: new Date('2026-08-19T00:00:01Z') }],
    });

    const result = await useCase.execute();

    expect(result.kpis.mrr).toBe(990_000n);
  });

  it('counts only ACTIVE tenants in the active KPI, but all of them in the total', async () => {
    const useCase = harness({
      facts: facts({
        tenants: [
          tenantFacts({ id: 'a', status: 'active' }),
          tenantFacts({ id: 'b', status: 'suspended' }),
          tenantFacts({ id: 'c', status: 'expired' }),
        ],
      }),
      subs: [],
    });

    const result = await useCase.execute();

    expect(result.kpis).toMatchObject({ tenantCount: 3, activeTenantCount: 1 });
  });

  it('derives the activation lag in HOURS from the first realized booking', async () => {
    const useCase = harness({
      facts: facts({
        tenants: [
          tenantFacts({
            createdAt: new Date('2026-01-01T00:00:00Z'),
            firstBookingAt: new Date('2026-01-03T12:00:00Z'),
          }),
        ],
      }),
    });

    const result = await useCase.execute();

    expect(result.tenants[0]?.firstBookingHours).toBe(60);
  });

  it('answers null activation lag for a tenant that has never sold anything', async () => {
    // Zero would read as "activated instantly", which is the opposite claim.
    const useCase = harness();

    const result = await useCase.execute();

    expect(result.tenants[0]?.firstBookingHours).toBeNull();
  });

  it('floors a NEGATIVE activation lag at zero rather than reporting it', async () => {
    // Backfilled data can put a booking before the tenant row; a negative lag is
    // not a meaningful figure to show.
    const useCase = harness({
      facts: facts({
        tenants: [
          tenantFacts({
            createdAt: new Date('2026-01-05T00:00:00Z'),
            firstBookingAt: new Date('2026-01-01T00:00:00Z'),
          }),
        ],
      }),
    });

    const result = await useCase.execute();

    expect(result.tenants[0]?.firstBookingHours).toBe(0);
  });

  it('joins webhook and payout counts to the right tenant, defaulting to zero', async () => {
    const useCase = harness({
      facts: facts({
        tenants: [tenantFacts({ id: 'a' }), tenantFacts({ id: 'b' })],
        webhookFailures: [{ tenantId: 'b', count: 3 }],
        overduePayouts: [{ tenantId: 'a', count: 2 }],
        webhookFailureTotal: 3,
      }),
      subs: [],
    });

    const result = await useCase.execute();

    expect(result.tenants.map((t) => [t.tenantId, t.webhookFailures, t.overduePayouts])).toEqual([
      ['a', 0, 2],
      ['b', 3, 0],
    ]);
    expect(result.kpis).toMatchObject({ webhookFailures: 3, overduePayouts: 2 });
  });

  it('queues a subscription expiring within FOURTEEN days', async () => {
    const useCase = harness({
      subs: [{ tenantId: 'tenant-1', expiresAt: new Date('2026-08-25T00:00:00Z') }],
    });

    const result = await useCase.execute();

    expect(result.expiring).toEqual([
      {
        tenantId: 'tenant-1',
        tenantName: 'StudioHub',
        planName: 'Chuyên nghiệp',
        status: 'active',
        expiresAt: new Date('2026-08-25T00:00:00Z'),
        daysLeft: 6,
      },
    ]);
  });

  it('ROUNDS UP a partial day — a subscription with hours left still has a day', async () => {
    // Six and a half days must read as 7, not 6: the operator is being told how
    // long they have, and truncating hands them a deadline earlier than the
    // real one.
    const useCase = harness({
      subs: [{ tenantId: 'tenant-1', expiresAt: new Date('2026-08-25T12:00:00Z') }],
    });

    const result = await useCase.execute();

    expect(result.expiring[0]?.daysLeft).toBe(7);
  });

  it('leaves a subscription expiring beyond the window out of the queue', async () => {
    const useCase = harness({
      subs: [{ tenantId: 'tenant-1', expiresAt: new Date('2026-09-30T00:00:00Z') }],
    });

    const result = await useCase.execute();

    expect(result.expiring).toEqual([]);
  });

  it('keeps an ALREADY-lapsed billable subscription in the queue, with negative days', async () => {
    // It is the most urgent renewal on the board, not the least.
    const useCase = harness({
      subs: [{ tenantId: 'tenant-1', expiresAt: new Date('2026-08-14T00:00:00Z') }],
    });

    const result = await useCase.execute();

    expect(result.expiring[0]).toMatchObject({ daysLeft: -5 });
  });

  it('excludes a cancelled subscription from the renewal queue', async () => {
    // There is nothing to renew; it would only crowd out the real ones.
    const useCase = harness({
      subs: [
        {
          tenantId: 'tenant-1',
          status: 'cancelled',
          expiresAt: new Date('2026-08-25T00:00:00Z'),
        },
      ],
    });

    const result = await useCase.execute();

    expect(result.expiring).toEqual([]);
  });

  it('sorts the queue SOONEST first', async () => {
    const useCase = harness({
      facts: facts({
        tenants: [
          tenantFacts({ id: 'a', name: 'A' }),
          tenantFacts({ id: 'b', name: 'B' }),
          tenantFacts({ id: 'c', name: 'C' }),
        ],
      }),
      subs: [
        { tenantId: 'a', expiresAt: new Date('2026-08-28T00:00:00Z') },
        { tenantId: 'b', expiresAt: new Date('2026-08-20T00:00:00Z') },
        { tenantId: 'c', expiresAt: new Date('2026-08-24T00:00:00Z') },
      ],
    });

    const result = await useCase.execute();

    expect(result.expiring.map((r) => r.tenantId)).toEqual(['b', 'c', 'a']);
  });

  it('leaves a tenant with no subscription out of the queue and off MRR', async () => {
    const useCase = harness({ subs: [] });

    const result = await useCase.execute();

    expect(result.tenants[0]?.subscription).toBeNull();
    expect(result.expiring).toEqual([]);
    expect(result.kpis.mrr).toBe(0n);
  });

  it('passes the GMV trend through untouched', async () => {
    const useCase = harness();

    const result = await useCase.execute();

    expect(result.gmvTrend).toEqual([{ date: '2026-08-18', gmv: 50_000n }]);
  });

  it('sums the published-listing and booking KPIs across every tenant', async () => {
    const useCase = harness({
      facts: facts({
        tenants: [
          tenantFacts({ id: 'a', publishedListings: 10, bookings30d: 5 }),
          tenantFacts({ id: 'b', publishedListings: 7, bookings30d: 2 }),
        ],
      }),
      subs: [],
    });

    const result = await useCase.execute();

    expect(result.kpis).toMatchObject({ publishedListings: 17, bookings30d: 7 });
  });
});
