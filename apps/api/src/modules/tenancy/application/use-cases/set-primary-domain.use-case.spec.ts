import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb } from '~testing';
import { DomainNotFound, DomainNotVerified } from '../../domain/errors/tenancy-errors';
import type { ITenantCache } from '../../domain/ports/tenant-cache.port';
import type {
  DomainRecord,
  ITenantDomainRepository,
} from '../../domain/ports/tenant-domain-repository.port';
import { SetPrimaryDomainUseCase } from './set-primary-domain.use-case';

const TENANT_ID = 'tenant-1';
const DOMAIN_ID = 'domain-1';

const domain = (overrides: Partial<DomainRecord> = {}): DomainRecord => ({
  id: DOMAIN_ID,
  tenantId: TENANT_ID,
  hostname: 'dat.studiohub.vn',
  isPrimary: false,
  kind: 'storefront',
  verificationToken: null,
  verifiedAt: new Date('2026-01-01T00:00:00Z'),
  ...overrides,
});

function harness(found: DomainRecord | null = domain()) {
  const promoted: Array<{ tenantId: string; id: string; tx: unknown }> = [];
  const evicted: string[] = [];
  const tenantDb = fakeTenantDb();
  return {
    useCase: new SetPrimaryDomainUseCase(
      fakePort<ITenantDomainRepository>({
        findById: () => Promise.resolve(found),
        setPrimary: (tenantId, id, tx) => {
          promoted.push({ tenantId, id, tx });
          return Promise.resolve({ ...domain(), isPrimary: true });
        },
      }),
      fakePort<ITenantCache>({
        invalidateHost: (hostname) => {
          evicted.push(hostname);
          return Promise.resolve();
        },
      }),
      tenantDb.service,
    ),
    tenantDb,
    promoted,
    evicted,
  };
}

describe('SetPrimaryDomainUseCase', () => {
  it('answers not-found for an unknown id', async () => {
    const { useCase, promoted } = harness(null);

    await expect(useCase.execute(TENANT_ID, DOMAIN_ID)).rejects.toBeInstanceOf(DomainNotFound);
    expect(promoted).toEqual([]);
  });

  it('REFUSES to promote an unverified domain', async () => {
    // Only a verified domain may carry the storefront; promoting one that is
    // not would take the shop offline.
    const { useCase, promoted } = harness(domain({ verifiedAt: null }));

    await expect(useCase.execute(TENANT_ID, DOMAIN_ID)).rejects.toBeInstanceOf(DomainNotVerified);
    expect(promoted).toEqual([]);
  });

  it('performs the swap inside the tenant transaction', async () => {
    // Clearing the old primary and setting the new one has to be atomic — the
    // one-primary partial unique index has no room for an in-between state.
    const { useCase, promoted, tenantDb } = harness();

    await useCase.execute(TENANT_ID, DOMAIN_ID);

    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(promoted).toEqual([{ tenantId: TENANT_ID, id: DOMAIN_ID, tx: tenantDb.tx }]);
  });

  it('is a NO-OP when the domain is already primary', async () => {
    // Re-running the swap would clear and re-set the same row for nothing.
    const { useCase, promoted } = harness(domain({ isPrimary: true }));

    const result = await useCase.execute(TENANT_ID, DOMAIN_ID);

    expect(promoted).toEqual([]);
    expect(result).toMatchObject({ id: DOMAIN_ID, isPrimary: true });
  });

  it('evicts the host cache for the promoted hostname', async () => {
    const { useCase, evicted } = harness();

    await useCase.execute(TENANT_ID, DOMAIN_ID);

    expect(evicted).toEqual(['dat.studiohub.vn']);
  });
});
