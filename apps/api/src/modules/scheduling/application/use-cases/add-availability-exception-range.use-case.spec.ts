import { describe, expect, it } from 'vitest';
import type { AvailabilityExceptionRangeInput } from '@booking/contracts';
import { fakePort, fakeTenantDb } from '~testing';
import { ResourceNotFound } from '../../../listing/domain/errors/listing-errors';
import type {
  IResourceRepository,
  ResourceRecord,
} from '../../../listing/domain/ports/resource-repository.port';
import type { IAvailabilityCache } from '../../domain/ports/availability-cache.port';
import type { IAvailabilityExceptionRepository } from '../../domain/ports/availability-exception-repository.port';
import { AddAvailabilityExceptionRangeUseCase } from './add-availability-exception-range.use-case';

const TENANT_ID = 'tenant-1';
const RESOURCE_ID = 'resource-1';
const PARTNER_ID = 'partner-1';

const resource = (): ResourceRecord =>
  ({
    id: RESOURCE_ID,
    tenantId: TENANT_ID,
    partnerId: PARTNER_ID,
    name: 'Court 1',
    timezone: 'Asia/Ho_Chi_Minh',
    createdAt: new Date(),
  }) as ResourceRecord;

function harness(found: ResourceRecord | null = resource()) {
  const effects: string[] = [];
  const dates: string[] = [];
  const tenantDb = fakeTenantDb();
  return {
    useCase: new AddAvailabilityExceptionRangeUseCase(
      fakePort<IResourceRepository>({ findById: () => Promise.resolve(found) }),
      fakePort<IAvailabilityExceptionRepository>({
        create: (_tx, _tenantId, _resourceId, data) => {
          effects.push('create');
          dates.push(data.date);
          return Promise.resolve({ id: `exception-${data.date}`, ...data } as never);
        },
      }),
      tenantDb.service,
      fakePort<IAvailabilityCache>({
        invalidateResource: () => {
          effects.push('invalidate');
          return Promise.resolve();
        },
      }),
    ),
    tenantDb,
    effects,
    dates,
  };
}

const range = (overrides: Record<string, unknown> = {}) =>
  ({
    from: '2026-09-01',
    to: '2026-09-03',
    type: 'closed',
    ...overrides,
  }) as AvailabilityExceptionRangeInput;

describe('AddAvailabilityExceptionRangeUseCase', () => {
  it('closes every date in the span, inclusive of both ends', async () => {
    const { useCase, dates } = harness();

    const created = await useCase.execute(
      { tenantId: TENANT_ID, partnerId: PARTNER_ID },
      RESOURCE_ID,
      range(),
    );

    expect(dates).toEqual(['2026-09-01', '2026-09-02', '2026-09-03']);
    expect(created).toHaveLength(3);
  });

  it('commits the whole span in ONE transaction', async () => {
    // A partner closing a two-week holiday must never end up half-closed.
    const { useCase, tenantDb } = harness();

    await useCase.execute({ tenantId: TENANT_ID, partnerId: PARTNER_ID }, RESOURCE_ID, range());

    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
  });

  it('invalidates the cache ONCE, after the whole span is committed', async () => {
    // The cache is keyed by resource, so per-date invalidation would repeat
    // identical work and each intermediate one could repopulate stale slots from
    // the not-yet-committed remainder of the span.
    const { useCase, effects } = harness();

    await useCase.execute({ tenantId: TENANT_ID, partnerId: PARTNER_ID }, RESOURCE_ID, range());

    expect(effects).toEqual(['create', 'create', 'create', 'invalidate']);
  });

  it('handles a single-day span', async () => {
    const { useCase, dates } = harness();

    await useCase.execute(
      { tenantId: TENANT_ID, partnerId: PARTNER_ID },
      RESOURCE_ID,
      range({ to: '2026-09-01' }),
    );

    expect(dates).toEqual(['2026-09-01']);
  });

  it('writes nothing when the resource check fails', async () => {
    const { useCase, effects } = harness(null);

    await expect(
      useCase.execute({ tenantId: TENANT_ID, partnerId: PARTNER_ID }, RESOURCE_ID, range()),
    ).rejects.toBeInstanceOf(ResourceNotFound);
    expect(effects).toEqual([]);
  });
});
