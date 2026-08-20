import { describe, expect, it } from 'vitest';
import { fakePort } from '~testing';
import { TenantNotFound } from '../../../../shared/domain/errors/tenant-not-found';
import type { ITenantRepository, TenantRecord } from '../../domain/ports/tenant-repository.port';
import { GetTenantUseCase } from './get-tenant.use-case';

const TENANT = { id: 'tenant-1', name: 'StudioHub' } as TenantRecord;

function harness(found: TenantRecord | null) {
  const asked: string[] = [];
  return {
    useCase: new GetTenantUseCase(
      fakePort<ITenantRepository>({
        findById: (id) => {
          asked.push(id);
          return Promise.resolve(found);
        },
      }),
    ),
    asked,
  };
}

describe('GetTenantUseCase', () => {
  it('answers not-found rather than null', async () => {
    // Every caller composes on the record; a null would surface downstream as a
    // property access on undefined instead of a 404.
    const { useCase } = harness(null);

    await expect(useCase.execute('tenant-1')).rejects.toBeInstanceOf(TenantNotFound);
  });

  it('returns the tenant it was asked about', async () => {
    const { useCase, asked } = harness(TENANT);

    await expect(useCase.execute('tenant-1')).resolves.toBe(TENANT);
    expect(asked).toEqual(['tenant-1']);
  });
});
