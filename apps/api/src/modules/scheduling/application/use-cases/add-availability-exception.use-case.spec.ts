import { describe, expect, it } from 'vitest';
import type { AvailabilityExceptionInput } from '@booking/contracts';
import { fakePort, fakeTenantDb } from '~testing';
import { ResourceNotFound } from '../../../listing/domain/errors/listing-errors';
import type {
  IResourceRepository,
  ResourceRecord,
} from '../../../listing/domain/ports/resource-repository.port';
import { ResourceNotOwnedForAvailability } from '../../domain/errors/availability-errors';
import type { IAvailabilityCache } from '../../domain/ports/availability-cache.port';
import type { IAvailabilityExceptionRepository } from '../../domain/ports/availability-exception-repository.port';
import { AddAvailabilityExceptionUseCase } from './add-availability-exception.use-case';

const TENANT_ID = 'tenant-1';
const RESOURCE_ID = 'resource-1';
const PARTNER_ID = 'partner-1';

const resource = (partnerId = PARTNER_ID): ResourceRecord =>
  ({
    id: RESOURCE_ID,
    tenantId: TENANT_ID,
    partnerId,
    name: 'Court 1',
    timezone: 'Asia/Ho_Chi_Minh',
    createdAt: new Date(),
  }) as ResourceRecord;

function harness(found: ResourceRecord | null) {
  const effects: string[] = [];
  const created: unknown[] = [];
  const tenantDb = fakeTenantDb();
  return {
    useCase: new AddAvailabilityExceptionUseCase(
      fakePort<IResourceRepository>({ findById: () => Promise.resolve(found) }),
      fakePort<IAvailabilityExceptionRepository>({
        create: (_tx, _tenantId, _resourceId, data) => {
          effects.push('create');
          created.push(data);
          return Promise.resolve({ id: 'exception-1', ...data } as never);
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
    created,
  };
}

const input = {
  date: '2026-09-01',
  type: 'closed',
  reason: 'Bảo trì',
} as AvailabilityExceptionInput;

describe('AddAvailabilityExceptionUseCase', () => {
  it('answers 404 for a resource that does not exist', async () => {
    const { useCase, effects } = harness(null);

    await expect(
      useCase.execute({ tenantId: TENANT_ID, partnerId: PARTNER_ID }, RESOURCE_ID, input),
    ).rejects.toBeInstanceOf(ResourceNotFound);
    expect(effects).toEqual([]);
  });

  it("answers 403 for another partner's resource", async () => {
    const { useCase, effects } = harness(resource('partner-2'));

    await expect(
      useCase.execute({ tenantId: TENANT_ID, partnerId: PARTNER_ID }, RESOURCE_ID, input),
    ).rejects.toBeInstanceOf(ResourceNotOwnedForAvailability);
    expect(effects).toEqual([]);
  });

  it('writes the exception, then invalidates the resource cache', async () => {
    // Order matters: invalidating first would let a concurrent read repopulate
    // the cache from the pre-write state.
    const { useCase, tenantDb, effects, created } = harness(resource());

    await useCase.execute({ tenantId: TENANT_ID, partnerId: PARTNER_ID }, RESOURCE_ID, input);

    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(effects).toEqual(['create', 'invalidate']);
    expect(created[0]).toMatchObject({ date: '2026-09-01', type: 'closed', reason: 'Bảo trì' });
  });

  it('leaves the cache alone when the write fails', async () => {
    const { useCase, effects } = harness(null);

    await expect(useCase.execute({ tenantId: TENANT_ID }, RESOURCE_ID, input)).rejects.toThrow();
    expect(effects).not.toContain('invalidate');
  });
});
