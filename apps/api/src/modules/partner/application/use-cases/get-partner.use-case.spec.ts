import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb } from '~testing';
import { PartnerNotFound } from '../../domain/errors/partner-errors';
import type { IPartnerReader } from '../../domain/ports/partner-reader.port';
import type { PartnerRecord } from '../../domain/ports/partner-repository.port';
import { GetPartnerUseCase } from './get-partner.use-case';

const PARTNER = { id: 'partner-1', name: 'Studio Giang' } as PartnerRecord;

function harness(found: PartnerRecord | null) {
  const tenantDb = fakeTenantDb();
  const asked: string[] = [];
  return {
    useCase: new GetPartnerUseCase(
      fakePort<IPartnerReader>({
        findById: (_tx, id) => {
          asked.push(id);
          return Promise.resolve(found);
        },
      }),
      tenantDb.service,
    ),
    tenantDb,
    asked,
  };
}

describe('GetPartnerUseCase', () => {
  it('answers not-found rather than null', async () => {
    const { useCase } = harness(null);

    await expect(useCase.execute('tenant-1', 'partner-1')).rejects.toBeInstanceOf(
      PartnerNotFound,
    );
  });

  it('reads inside the tenant transaction, so RLS scopes the lookup', async () => {
    // The id alone is not proof of ownership — RLS is what keeps one tenant
    // from reading another's partner by guessing an id.
    const { useCase, tenantDb, asked } = harness(PARTNER);

    await expect(useCase.execute('tenant-1', 'partner-1')).resolves.toBe(PARTNER);
    expect(tenantDb.openedFor).toEqual(['tenant-1']);
    expect(asked).toEqual(['partner-1']);
  });
});
