import { describe, expect, it } from 'vitest';
import { fakePort } from '~testing';
import { DomainNotFound, DomainPrimaryRequired } from '../../domain/errors/tenancy-errors';
import type { ITenantCache } from '../../domain/ports/tenant-cache.port';
import type {
  DomainRecord,
  ITenantDomainRepository,
} from '../../domain/ports/tenant-domain-repository.port';
import { DeleteDomainUseCase } from './delete-domain.use-case';

const TENANT_ID = 'tenant-1';
const DOMAIN_ID = 'domain-1';

const domain = (overrides: Partial<DomainRecord> = {}): DomainRecord => ({
  id: DOMAIN_ID,
  tenantId: TENANT_ID,
  hostname: 'dat.studiohub.vn',
  isPrimary: true,
  kind: 'storefront',
  verificationToken: null,
  verifiedAt: new Date('2026-01-01T00:00:00Z'),
  ...overrides,
});

function harness(found: DomainRecord | null = domain(), siblings: DomainRecord[] = [domain()]) {
  const deleted: string[] = [];
  const evicted: string[] = [];
  const listedKinds: string[] = [];
  return {
    useCase: new DeleteDomainUseCase(
      fakePort<ITenantDomainRepository>({
        findById: () => Promise.resolve(found),
        listByTenantAndKind: (_tenantId, kind) => {
          listedKinds.push(kind);
          return Promise.resolve(siblings);
        },
        delete: (id) => {
          deleted.push(id);
          return Promise.resolve();
        },
      }),
      fakePort<ITenantCache>({
        invalidateHost: (hostname) => {
          evicted.push(hostname);
          return Promise.resolve();
        },
      }),
    ),
    deleted,
    evicted,
    listedKinds,
  };
}

describe('DeleteDomainUseCase', () => {
  it('answers not-found for an unknown id', async () => {
    const { useCase, deleted } = harness(null);

    await expect(useCase.execute(TENANT_ID, DOMAIN_ID)).rejects.toBeInstanceOf(DomainNotFound);
    expect(deleted).toEqual([]);
  });

  it("refuses ANOTHER tenant's domain", async () => {
    const { useCase, deleted } = harness(domain({ tenantId: 'tenant-2' }));

    await expect(useCase.execute(TENANT_ID, DOMAIN_ID)).rejects.toBeInstanceOf(DomainNotFound);
    expect(deleted).toEqual([]);
  });

  it('REFUSES to orphan the storefront by deleting its only verified domain', async () => {
    const { useCase, deleted } = harness();

    await expect(useCase.execute(TENANT_ID, DOMAIN_ID)).rejects.toBeInstanceOf(
      DomainPrimaryRequired,
    );
    expect(deleted).toEqual([]);
  });

  it('checks siblings of the TARGET KIND only', async () => {
    // A storefront sibling must never save a dashboard host from deletion, and
    // vice versa.
    const { useCase, listedKinds } = harness(domain({ kind: 'dashboard' }), [
      domain({ kind: 'dashboard' }),
      domain({ id: 'domain-2', kind: 'dashboard' }),
    ]);

    await useCase.execute(TENANT_ID, DOMAIN_ID);

    expect(listedKinds).toEqual(['dashboard']);
  });

  it('allows the delete when another verified domain of that kind survives', async () => {
    const { useCase, deleted } = harness(domain(), [
      domain(),
      domain({ id: 'domain-2', isPrimary: false }),
    ]);

    await useCase.execute(TENANT_ID, DOMAIN_ID);

    expect(deleted).toEqual([DOMAIN_ID]);
  });

  it('does not count an UNVERIFIED sibling as a survivor', async () => {
    // An unverified domain cannot carry the storefront, so it saves nothing.
    const { useCase, deleted } = harness(domain(), [
      domain(),
      domain({ id: 'domain-2', isPrimary: false, verifiedAt: null }),
    ]);

    await expect(useCase.execute(TENANT_ID, DOMAIN_ID)).rejects.toBeInstanceOf(
      DomainPrimaryRequired,
    );
    expect(deleted).toEqual([]);
  });

  it('skips the sibling query for a non-primary domain', async () => {
    // The common delete path must not pay for a round-trip the rule cannot use.
    const { useCase, listedKinds, deleted } = harness(domain({ isPrimary: false }));

    await useCase.execute(TENANT_ID, DOMAIN_ID);

    expect(listedKinds).toEqual([]);
    expect(deleted).toEqual([DOMAIN_ID]);
  });

  it('skips the sibling query for an unverified domain', async () => {
    const { useCase, listedKinds, deleted } = harness(domain({ verifiedAt: null }));

    await useCase.execute(TENANT_ID, DOMAIN_ID);

    expect(listedKinds).toEqual([]);
    expect(deleted).toEqual([DOMAIN_ID]);
  });

  it('evicts the host cache so the hostname stops resolving immediately', async () => {
    const { useCase, evicted } = harness(domain({ isPrimary: false }));

    await useCase.execute(TENANT_ID, DOMAIN_ID);

    expect(evicted).toEqual(['dat.studiohub.vn']);
  });
});
