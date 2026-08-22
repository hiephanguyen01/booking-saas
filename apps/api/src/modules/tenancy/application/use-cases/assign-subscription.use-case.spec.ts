import { describe, expect, it } from 'vitest';
import type { AssignSubscriptionInput } from '@booking/contracts';
import { fakePort } from '~testing';
import { TenantNotFound } from '../../../../shared/domain/errors/tenant-not-found';
import { InvalidSubscriptionPeriod, PlanNotFound } from '../../domain/errors/billing-errors';
import type { IPlanRepository, PlanRecord } from '../../domain/ports/plan-repository.port';
import type {
  AssignSubscriptionData,
  ISubscriptionRepository,
  SubscriptionRecord,
} from '../../domain/ports/subscription-repository.port';
import type { ITenantRepository, TenantRecord } from '../../domain/ports/tenant-repository.port';
import { AssignSubscriptionUseCase } from './assign-subscription.use-case';

const TENANT_ID = 'tenant-1';
const PLAN_ID = 'plan-1';

function harness(options: { tenant?: TenantRecord | null; plan?: PlanRecord | null } = {}) {
  const created: AssignSubscriptionData[] = [];
  return {
    useCase: new AssignSubscriptionUseCase(
      fakePort<ITenantRepository>({
        findById: () =>
          Promise.resolve(
            options.tenant === undefined ? ({ id: TENANT_ID } as TenantRecord) : options.tenant,
          ),
      }),
      fakePort<IPlanRepository>({
        findById: () =>
          Promise.resolve(
            options.plan === undefined ? ({ id: PLAN_ID } as PlanRecord) : options.plan,
          ),
      }),
      fakePort<ISubscriptionRepository>({
        create: (data) => {
          created.push(data);
          return Promise.resolve({ id: 'sub-1', ...data } as unknown as SubscriptionRecord);
        },
      }),
    ),
    created,
  };
}

const input = (overrides: Partial<AssignSubscriptionInput> = {}) =>
  ({
    planId: PLAN_ID,
    status: 'active',
    expiresAt: '2026-12-31T00:00:00.000Z',
    ...overrides,
  }) as AssignSubscriptionInput;

describe('AssignSubscriptionUseCase', () => {
  it('answers not-found for an unknown tenant', async () => {
    const { useCase, created } = harness({ tenant: null });

    await expect(useCase.execute(TENANT_ID, input())).rejects.toBeInstanceOf(TenantNotFound);
    expect(created).toEqual([]);
  });

  it('answers not-found for an unknown plan', async () => {
    const { useCase, created } = harness({ plan: null });

    await expect(useCase.execute(TENANT_ID, input())).rejects.toBeInstanceOf(PlanNotFound);
    expect(created).toEqual([]);
  });

  it('REFUSES a period that ends before it begins', async () => {
    const { useCase, created } = harness();

    await expect(
      useCase.execute(
        TENANT_ID,
        input({ startsAt: '2026-12-31T00:00:00.000Z', expiresAt: '2026-01-01T00:00:00.000Z' }),
      ),
    ).rejects.toBeInstanceOf(InvalidSubscriptionPeriod);
    expect(created).toEqual([]);
  });

  it('refuses a zero-length period too', async () => {
    const { useCase } = harness();

    await expect(
      useCase.execute(
        TENANT_ID,
        input({ startsAt: '2026-01-01T00:00:00.000Z', expiresAt: '2026-01-01T00:00:00.000Z' }),
      ),
    ).rejects.toBeInstanceOf(InvalidSubscriptionPeriod);
  });

  it('starts NOW when no start date was supplied', async () => {
    // Backdating by accident would put the tenant straight into grace.
    const { useCase, created } = harness();
    const before = Date.now();

    await useCase.execute(TENANT_ID, input());

    const startsAt = created[0]?.startsAt.getTime() ?? 0;
    expect(startsAt).toBeGreaterThanOrEqual(before);
    expect(startsAt).toBeLessThanOrEqual(Date.now());
  });

  it('APPENDS a row rather than editing the previous subscription', async () => {
    // The current reader orders by startsAt then createdAt, so a new row
    // supersedes the old one and the billing history survives.
    const { useCase, created } = harness();

    await useCase.execute(
      TENANT_ID,
      input({ startsAt: '2026-06-01T00:00:00.000Z', status: 'trial', note: 'Gia hạn tay' }),
    );

    expect(created).toEqual([
      {
        tenantId: TENANT_ID,
        planId: PLAN_ID,
        status: 'trial',
        startsAt: new Date('2026-06-01T00:00:00.000Z'),
        expiresAt: new Date('2026-12-31T00:00:00.000Z'),
        note: 'Gia hạn tay',
      },
    ]);
  });

  it('stores an absent note as null rather than undefined', async () => {
    const { useCase, created } = harness();

    await useCase.execute(TENANT_ID, input());

    expect(created[0]?.note).toBeNull();
  });
});
