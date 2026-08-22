import { describe, expect, it } from 'vitest';
import type { PlanLimits } from '@booking/contracts';
import { fakeCollaborator, fakePort } from '~testing';
import type { ITenantRepository } from '../../domain/ports/tenant-repository.port';
import type { GetPlanLimitsUseCase } from './get-plan-limits.use-case';
import { CheckBookingQuotaUseCase } from './check-booking-quota.use-case';

const LIMITS = { maxBookingsPerMonth: 100 } as unknown as PlanLimits;
const NOW = new Date('2026-08-19T13:45:00Z');

function harness(current: number, limits: PlanLimits | null = LIMITS) {
  const windows: Array<{ from: Date; to: Date }> = [];
  return {
    useCase: new CheckBookingQuotaUseCase(
      fakePort<ITenantRepository>({
        countBookingsBetween: (_tenantId, from, to) => {
          windows.push({ from, to });
          return Promise.resolve(current);
        },
      }),
      fakeCollaborator<GetPlanLimitsUseCase>({ execute: () => Promise.resolve(limits) }),
    ),
    windows,
  };
}

describe('CheckBookingQuotaUseCase', () => {
  it('NEVER blocks, even far over the limit', async () => {
    // A soft limit warns the tenant; blocking here would fail the customer's
    // checkout for the tenant's billing problem.
    const { useCase } = harness(5000);

    const result = await useCase.execute('tenant-1', NOW);

    expect(result.allowed).toBe(true);
    expect(result.overLimit).toBe(true);
  });

  it('reports not-over while below the limit', async () => {
    const { useCase } = harness(99);

    await expect(useCase.execute('tenant-1', NOW)).resolves.toMatchObject({
      overLimit: false,
      limit: 100,
      current: 99,
    });
  });

  it('counts reaching the limit as over it', async () => {
    // The 100th booking of a 100-booking plan uses the last of the allowance,
    // which is when the upgrade prompt should appear.
    const { useCase } = harness(100);

    await expect(useCase.execute('tenant-1', NOW)).resolves.toMatchObject({ overLimit: true });
  });

  it('counts the CALENDAR month containing `now`', async () => {
    // A rolling 30-day window would move the reset date every month.
    const { useCase, windows } = harness(10);

    await useCase.execute('tenant-1', NOW);

    expect(windows).toEqual([
      { from: new Date('2026-08-01T00:00:00Z'), to: new Date('2026-09-01T00:00:00Z') },
    ]);
  });

  it('rolls the window into the next YEAR in December', async () => {
    const { useCase, windows } = harness(10);

    await useCase.execute('tenant-1', new Date('2026-12-15T00:00:00Z'));

    expect(windows).toEqual([
      { from: new Date('2026-12-01T00:00:00Z'), to: new Date('2027-01-01T00:00:00Z') },
    ]);
  });

  it('answers a harmless zero, and counts nothing, when there is no plan', async () => {
    // Unlike the hard caps this one must not fail closed — its only consumer is
    // a dashboard banner.
    const { useCase, windows } = harness(50, null);

    await expect(useCase.execute('tenant-1', NOW)).resolves.toEqual({
      allowed: true,
      overLimit: false,
      limit: 0,
      current: 0,
    });
    expect(windows).toEqual([]);
  });
});
