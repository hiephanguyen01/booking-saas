import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb } from '~testing';
import { PartnerNotFound } from '../../domain/errors/partner-errors';
import type { IPartnerReader } from '../../domain/ports/partner-reader.port';
import type { PartnerRecord } from '../../domain/ports/partner-repository.port';
import { GetPartnerProfileUseCase } from './get-partner-profile.use-case';

const PARTNER = { id: 'partner-1', name: 'Studio Giang' } as PartnerRecord;

function harness(options: { tenantId?: string | null; found?: PartnerRecord | null } = {}) {
  const tenantDb = fakeTenantDb();
  return {
    useCase: new GetPartnerProfileUseCase(
      fakePort<IPartnerReader>({
        tenantIdOfPartner: () =>
          Promise.resolve(options.tenantId === undefined ? 'tenant-9' : options.tenantId),
        findById: () => Promise.resolve(options.found === undefined ? PARTNER : options.found),
      }),
      tenantDb.service,
    ),
    tenantDb,
  };
}

describe('GetPartnerProfileUseCase', () => {
  it('answers not-found when the partner belongs to no tenant', async () => {
    const { useCase, tenantDb } = harness({ tenantId: null });

    await expect(useCase.execute('partner-1')).rejects.toBeInstanceOf(PartnerNotFound);
    expect(tenantDb.openedFor).toEqual([]);
  });

  it("opens the transaction on the PARTNER's own tenant", async () => {
    // The route is partner-scoped and carries no tenant header.
    const { useCase, tenantDb } = harness();

    await useCase.execute('partner-1');

    expect(tenantDb.openedFor).toEqual(['tenant-9']);
  });

  it('answers not-found when RLS hides the row despite the tenant resolving', async () => {
    const { useCase } = harness({ found: null });

    await expect(useCase.execute('partner-1')).rejects.toBeInstanceOf(PartnerNotFound);
  });
});
