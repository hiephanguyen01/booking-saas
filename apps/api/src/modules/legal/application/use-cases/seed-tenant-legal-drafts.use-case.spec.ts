import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb, fakeTx } from '~testing';
import type { ILegalDocumentRepository } from '../../domain/ports/legal-document-repository.port';
import { SeedTenantLegalDraftsUseCase } from './seed-tenant-legal-drafts.use-case';

function harness() {
  const seeds: Array<{ tenantId: string; locales: readonly string[]; tx: unknown }> = [];
  const tenantDb = fakeTenantDb();
  return {
    useCase: new SeedTenantLegalDraftsUseCase(
      fakePort<ILegalDocumentRepository>({
        seedDrafts: (tx, tenantId, locales) => {
          seeds.push({ tenantId, locales, tx });
          return Promise.resolve();
        },
      }),
      tenantDb.service,
    ),
    tenantDb,
    seeds,
  };
}

describe('SeedTenantLegalDraftsUseCase', () => {
  it('composes into a CALLER-owned transaction when given one', async () => {
    // Tenant creation seeds the drafts in its own transaction; opening a second
    // one here would let a tenant commit without them.
    const { useCase, tenantDb, seeds } = harness();
    const tx = fakeTx({});

    await useCase.execute('tenant-1', tx);

    expect(tenantDb.openedFor).toEqual([]);
    expect(seeds[0]?.tx).toBe(tx);
  });

  it('opens its own transaction when called standalone', async () => {
    const { useCase, tenantDb } = harness();

    await useCase.execute('tenant-1');

    expect(tenantDb.openedFor).toEqual(['tenant-1']);
  });

  it('drafts BOTH shipped locales, so the tenant can publish either', async () => {
    const { useCase, seeds } = harness();

    await useCase.execute('tenant-1');

    expect(seeds[0]).toMatchObject({ tenantId: 'tenant-1', locales: ['vi', 'en'] });
  });
});
