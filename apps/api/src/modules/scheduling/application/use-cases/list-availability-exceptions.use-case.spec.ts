import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakePort, fakeTenantDb } from '~testing';
import { ResourceNotFound } from '../../../listing/domain/errors/listing-errors';
import type {
  IResourceRepository,
  ResourceRecord,
} from '../../../listing/domain/ports/resource-repository.port';
import { ResourceNotOwnedForAvailability } from '../../domain/errors/availability-errors';
import type {
  AvailabilityExceptionRecord,
  IAvailabilityExceptionRepository,
} from '../../domain/ports/availability-exception-repository.port';
import { ListAvailabilityExceptionsUseCase } from './list-availability-exceptions.use-case';

const TENANT_ID = 'tenant-1';
const RESOURCE_ID = 'resource-1';

const resource = (overrides: Partial<ResourceRecord> = {}): ResourceRecord => ({
  id: RESOURCE_ID,
  tenantId: TENANT_ID,
  partnerId: 'partner-1',
  name: 'Studio A',
  timezone: 'Asia/Ho_Chi_Minh',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  ...overrides,
});

interface Harness {
  readonly useCase: ListAvailabilityExceptionsUseCase;
  readonly tenantDb: ReturnType<typeof fakeTenantDb>;
  /** Every `(from, to)` the repository was asked for. */
  readonly ranges: Array<{ from: string; to: string }>;
}

function harness(found: ResourceRecord | null = resource()): Harness {
  const tenantDb = fakeTenantDb();
  const ranges: Array<{ from: string; to: string }> = [];

  const resources = fakePort<IResourceRepository>({
    findById: () => Promise.resolve(found),
  });
  const exceptions = fakePort<IAvailabilityExceptionRepository>({
    listByResource: (_tx, _resourceId, from, to) => {
      ranges.push({ from, to });
      return Promise.resolve([] as AvailabilityExceptionRecord[]);
    },
  });

  return {
    useCase: new ListAvailabilityExceptionsUseCase(resources, exceptions, tenantDb.service),
    tenantDb,
    ranges,
  };
}

describe('ListAvailabilityExceptionsUseCase', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-19T17:30:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('reads today through today + 180 days when the caller names no range', async () => {
    const { useCase, ranges } = harness();

    await useCase.execute({ tenantId: TENANT_ID }, RESOURCE_ID);

    // 2026-08-19 + 180d = 2027-02-15. The default window is what makes a partner
    // calendar rendering a past or far-future month come back empty, so the
    // boundary is the behaviour, not an implementation detail.
    expect(ranges).toEqual([{ from: '2026-08-19', to: '2027-02-15' }]);
  });

  it('takes the date part of the current instant, not the local calendar day', async () => {
    // 17:30 UTC is already the 20th in Asia/Ho_Chi_Minh (UTC+7). The window is
    // computed in UTC, and the stored exception dates are too.
    const { useCase, ranges } = harness();

    await useCase.execute({ tenantId: TENANT_ID }, RESOURCE_ID);

    expect(ranges[0]?.from).toBe('2026-08-19');
  });

  it('passes an explicit range straight through', async () => {
    const { useCase, ranges } = harness();

    await useCase.execute({ tenantId: TENANT_ID }, RESOURCE_ID, {
      from: '2026-03-01',
      to: '2026-03-31',
    });

    expect(ranges).toEqual([{ from: '2026-03-01', to: '2026-03-31' }]);
  });

  it('reads inside one transaction opened for the caller tenant', async () => {
    const { useCase, tenantDb } = harness();

    await useCase.execute({ tenantId: TENANT_ID }, RESOURCE_ID);

    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
  });

  it('answers 404 when the resource does not exist', async () => {
    const { useCase, ranges } = harness(null);

    await expect(useCase.execute({ tenantId: TENANT_ID }, RESOURCE_ID)).rejects.toBeInstanceOf(
      ResourceNotFound,
    );
    expect(ranges).toEqual([]);
  });

  it('answers 403 when a partner asks for another partner resource', async () => {
    const { useCase, ranges } = harness(resource({ partnerId: 'partner-1' }));

    await expect(
      useCase.execute({ tenantId: TENANT_ID, partnerId: 'partner-2' }, RESOURCE_ID),
    ).rejects.toBeInstanceOf(ResourceNotOwnedForAvailability);
    expect(ranges).toEqual([]);
  });

  it('lets a tenant-scoped caller read any partner resource', async () => {
    const { useCase, ranges } = harness(resource({ partnerId: 'partner-2' }));

    await useCase.execute({ tenantId: TENANT_ID }, RESOURCE_ID);

    expect(ranges).toHaveLength(1);
  });
});
