import { describe, expect, it } from 'vitest';
import { fakeCollaborator } from '~testing';
import type { SoftLimitCheck } from '../../domain/plan-limits';
import type { TenantRecord } from '../../domain/ports/tenant-repository.port';
import type { CheckBookingQuotaUseCase } from './check-booking-quota.use-case';
import type {
  CurrentSubscriptionView,
  GetCurrentSubscriptionUseCase,
} from './get-current-subscription.use-case';
import type { GetTenantUseCase } from './get-tenant.use-case';
import { GetSubscriptionStatusUseCase } from './get-subscription-status.use-case';

const DB_NOW = new Date('2026-08-19T00:00:00Z');

const current = (overrides: Record<string, unknown> = {}): CurrentSubscriptionView =>
  ({
    subscription: {
      status: 'active',
      startsAt: new Date('2026-01-01T00:00:00Z'),
      expiresAt: new Date('2026-12-31T00:00:00Z'),
      ...(overrides.subscription as Record<string, unknown>),
    },
    plan: { plan: { id: 'plan-1' }, subscriberCount: 1 },
    evaluatedAt: DB_NOW,
  }) as unknown as CurrentSubscriptionView;

const QUOTA: SoftLimitCheck = { allowed: true, overLimit: true, limit: 100, current: 120 };

interface Options {
  current?: CurrentSubscriptionView | null;
  tenant?: Partial<TenantRecord>;
  quota?: SoftLimitCheck;
}

function harness(options: Options = {}) {
  const quotaClocks: Date[] = [];
  return {
    useCase: new GetSubscriptionStatusUseCase(
      fakeCollaborator<GetCurrentSubscriptionUseCase>({
        execute: () =>
          Promise.resolve(options.current === undefined ? current() : options.current),
      }),
      fakeCollaborator<CheckBookingQuotaUseCase>({
        execute: (_tenantId: unknown, now: unknown) => {
          quotaClocks.push(now as Date);
          return Promise.resolve(options.quota ?? QUOTA);
        },
      }),
      fakeCollaborator<GetTenantUseCase>({
        execute: () =>
          Promise.resolve({
            legalReadyAt: new Date('2026-02-01T00:00:00Z'),
            legalDocumentsReady: 4,
            ...options.tenant,
          } as TenantRecord),
      }),
    ),
    quotaClocks,
  };
}

describe('GetSubscriptionStatusUseCase', () => {
  it('evaluates a live subscription as active', async () => {
    const { useCase } = harness();

    const result = await useCase.execute('tenant-1');

    expect(result).toMatchObject({
      status: 'active',
      expiresAt: new Date('2026-12-31T00:00:00Z'),
      evaluation: { phase: 'active', storefrontLive: true, dashboardWritable: true },
    });
  });

  it('reports a never-subscribed tenant as expired, with no status', async () => {
    // The absence of a subscription is not a clock question — it is expired
    // whatever the time is.
    const { useCase } = harness({ current: null });

    const result = await useCase.execute('tenant-1');

    expect(result).toMatchObject({
      status: null,
      expiresAt: null,
      evaluation: { phase: 'expired', storefrontLive: false },
      bookingQuota: null,
    });
  });

  it('evaluates against the DATABASE clock captured with the selection', async () => {
    // An app clock would let host skew decide whether the storefront is dark.
    const { useCase, quotaClocks } = harness();

    await useCase.execute('tenant-1');

    expect(quotaClocks).toEqual([DB_NOW]);
  });

  it('surfaces the soft quota WITHOUT it affecting the lifecycle phase', async () => {
    // Being over the booking quota warns the tenant; it never darkens the
    // storefront.
    const { useCase } = harness();

    const result = await useCase.execute('tenant-1');

    expect(result.bookingQuota).toEqual({ used: 120, limit: 100, overLimit: true });
    expect(result.evaluation.storefrontLive).toBe(true);
  });

  it('reads legal readiness off the tenant row rather than recomputing it', async () => {
    // The outbox handler stamps it; recomputing here would be a second source
    // of truth that could disagree.
    const { useCase } = harness({ tenant: { legalReadyAt: null, legalDocumentsReady: 2 } });

    const result = await useCase.execute('tenant-1');

    expect(result).toMatchObject({ legalReady: false, legalDocumentsReady: 2 });
  });

  it('trusts the STAMP, not the count, when the two disagree', async () => {
    // The count can reach four before the outbox handler has stamped the row.
    // Deriving readiness from it here would open the storefront ahead of the
    // handler — a second source of truth for the one gate that must not be
    // guessed at.
    const { useCase } = harness({ tenant: { legalReadyAt: null, legalDocumentsReady: 4 } });

    const result = await useCase.execute('tenant-1');

    expect(result).toMatchObject({ legalReady: false, legalDocumentsReady: 4 });
  });

  it('reports the grace phase after expiry', async () => {
    const { useCase } = harness({
      current: current({ subscription: { expiresAt: new Date('2026-08-10T00:00:00Z') } }),
    });

    const result = await useCase.execute('tenant-1');

    expect(result.evaluation).toMatchObject({
      phase: 'grace',
      storefrontLive: false,
      dashboardWritable: false,
    });
  });
});
