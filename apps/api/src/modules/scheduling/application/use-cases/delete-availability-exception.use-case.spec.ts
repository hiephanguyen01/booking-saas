import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb } from '~testing';
import { ResourceNotFound } from '../../../listing/domain/errors/listing-errors';
import type {
  IResourceRepository,
  ResourceRecord,
} from '../../../listing/domain/ports/resource-repository.port';
import {
  AvailabilityExceptionNotFound,
  ResourceNotOwnedForAvailability,
} from '../../domain/errors/availability-errors';
import type { IAvailabilityCache } from '../../domain/ports/availability-cache.port';
import type {
  AvailabilityExceptionRecord,
  IAvailabilityExceptionRepository,
} from '../../domain/ports/availability-exception-repository.port';
import { DeleteAvailabilityExceptionUseCase } from './delete-availability-exception.use-case';

const TENANT_ID = 'tenant-1';
const RESOURCE_ID = 'resource-1';
const EXCEPTION_ID = 'exception-1';

const resource = (overrides: Partial<ResourceRecord> = {}): ResourceRecord => ({
  id: RESOURCE_ID,
  tenantId: TENANT_ID,
  partnerId: 'partner-1',
  name: 'Court 3',
  timezone: 'Asia/Ho_Chi_Minh',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  ...overrides,
});

const exception = (resourceId: string): AvailabilityExceptionRecord => ({
  id: EXCEPTION_ID,
  resourceId,
  date: '2026-09-01',
  type: 'closed',
  windows: [],
  openTime: null,
  closeTime: null,
  reason: 'Bảo trì',
});

interface Harness {
  readonly useCase: DeleteAvailabilityExceptionUseCase;
  readonly tenantDb: ReturnType<typeof fakeTenantDb>;
  /** Side effects in the order they happened — the ordering is the contract. */
  readonly effects: string[];
}

function harness(options: {
  found?: ResourceRecord | null;
  existing?: AvailabilityExceptionRecord | null;
}): Harness {
  const tenantDb = fakeTenantDb();
  const effects: string[] = [];

  const resources = fakePort<IResourceRepository>({
    findById: () => Promise.resolve(options.found === undefined ? resource() : options.found),
  });
  const exceptions = fakePort<IAvailabilityExceptionRepository>({
    findById: () =>
      Promise.resolve(options.existing === undefined ? exception(RESOURCE_ID) : options.existing),
    delete: (_tx, id) => {
      effects.push(`delete:${id}`);
      return Promise.resolve();
    },
  });
  const cache = fakePort<IAvailabilityCache>({
    invalidateResource: (resourceId) => {
      effects.push(`invalidate:${resourceId}`);
      return Promise.resolve();
    },
  });

  return {
    useCase: new DeleteAvailabilityExceptionUseCase(resources, exceptions, tenantDb.service, cache),
    tenantDb,
    effects,
  };
}

describe('DeleteAvailabilityExceptionUseCase', () => {
  it('deletes inside the tenant transaction, then invalidates the resource cache', async () => {
    const { useCase, tenantDb, effects } = harness({});

    await useCase.execute({ tenantId: TENANT_ID }, RESOURCE_ID, EXCEPTION_ID);

    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    // Order matters: invalidating before the write commits would re-warm the
    // cache from the pre-delete state (§9.1).
    expect(effects).toEqual([`delete:${EXCEPTION_ID}`, `invalidate:${RESOURCE_ID}`]);
  });

  it('answers 404 for an exception that belongs to a different resource', async () => {
    // The id is guessable and resource ownership was checked on the URL's
    // resource, not on the exception — so this is the guard that stops a partner
    // deleting a neighbour closure by pointing at their own resource.
    const { useCase, effects } = harness({ existing: exception('resource-2') });

    await expect(
      useCase.execute({ tenantId: TENANT_ID }, RESOURCE_ID, EXCEPTION_ID),
    ).rejects.toBeInstanceOf(AvailabilityExceptionNotFound);
    expect(effects).toEqual([]);
  });

  it('answers 404 for an exception that does not exist', async () => {
    const { useCase, effects } = harness({ existing: null });

    await expect(
      useCase.execute({ tenantId: TENANT_ID }, RESOURCE_ID, EXCEPTION_ID),
    ).rejects.toBeInstanceOf(AvailabilityExceptionNotFound);
    expect(effects).toEqual([]);
  });

  it('answers 404 when the resource does not exist', async () => {
    const { useCase, effects } = harness({ found: null });

    await expect(
      useCase.execute({ tenantId: TENANT_ID }, RESOURCE_ID, EXCEPTION_ID),
    ).rejects.toBeInstanceOf(ResourceNotFound);
    expect(effects).toEqual([]);
  });

  it('answers 403 when a partner deletes on another partner resource', async () => {
    const { useCase, effects } = harness({ found: resource({ partnerId: 'partner-1' }) });

    await expect(
      useCase.execute({ tenantId: TENANT_ID, partnerId: 'partner-2' }, RESOURCE_ID, EXCEPTION_ID),
    ).rejects.toBeInstanceOf(ResourceNotOwnedForAvailability);
    expect(effects).toEqual([]);
  });

  it('leaves the cache untouched when the delete fails', async () => {
    const { useCase, effects } = harness({ existing: null });

    await expect(
      useCase.execute({ tenantId: TENANT_ID }, RESOURCE_ID, EXCEPTION_ID),
    ).rejects.toThrow();
    expect(effects).not.toContain(`invalidate:${RESOURCE_ID}`);
  });
});
