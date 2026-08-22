import { describe, expect, it } from 'vitest';
import { fakePort } from '~testing';
import {
  DomainNotFoundForTenant,
  DomainNotVerifiable,
} from '../../domain/errors/tenancy-errors';
import type { IDomainVerificationQueue } from '../../domain/ports/domain-verification-queue.port';
import type { ITenantCache } from '../../domain/ports/tenant-cache.port';
import type {
  DomainRecord,
  ITenantDomainRepository,
} from '../../domain/ports/tenant-domain-repository.port';
import { VerifyDomainUseCase } from './verify-domain.use-case';

const TENANT_ID = 'tenant-1';
const DOMAIN_ID = 'domain-1';

const domain = (overrides: Partial<DomainRecord> = {}): DomainRecord => ({
  id: DOMAIN_ID,
  tenantId: TENANT_ID,
  hostname: 'dat.studiohub.vn',
  isPrimary: false,
  kind: 'storefront',
  verificationToken: 'bookingos-verify=abc',
  verifiedAt: null,
  ...overrides,
});

function harness(found: DomainRecord | null = domain()) {
  const queued: Array<{ tenantId: string; domainId: string }> = [];
  const evicted: string[] = [];
  return {
    useCase: new VerifyDomainUseCase(
      fakePort<ITenantDomainRepository>({ findById: () => Promise.resolve(found) }),
      fakePort<IDomainVerificationQueue>({
        enqueue: (tenantId, domainId) => {
          queued.push({ tenantId, domainId });
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
    queued,
    evicted,
  };
}

describe('VerifyDomainUseCase', () => {
  it('answers not-found for an unknown domain id', async () => {
    const { useCase, queued } = harness(null);

    await expect(useCase.execute(TENANT_ID, DOMAIN_ID)).rejects.toBeInstanceOf(
      DomainNotFoundForTenant,
    );
    expect(queued).toEqual([]);
  });

  it("refuses ANOTHER tenant's domain, with the same not-found answer", async () => {
    // Domains are looked up by id alone, so the ownership check is what stops
    // one tenant triggering verification on another's hostname.
    const { useCase, queued } = harness(domain({ tenantId: 'tenant-2' }));

    await expect(useCase.execute(TENANT_ID, DOMAIN_ID)).rejects.toBeInstanceOf(
      DomainNotFoundForTenant,
    );
    expect(queued).toEqual([]);
  });

  it('SHORT-CIRCUITS an already-verified domain instead of re-queueing', async () => {
    const { useCase, queued } = harness(domain({ verifiedAt: new Date() }));

    const result = await useCase.execute(TENANT_ID, DOMAIN_ID);

    expect(result.status).toBe('verified');
    expect(queued).toEqual([]);
  });

  it('refuses a domain with no token — there is nothing to check against', async () => {
    const { useCase, queued } = harness(domain({ verificationToken: null }));

    await expect(useCase.execute(TENANT_ID, DOMAIN_ID)).rejects.toBeInstanceOf(
      DomainNotVerifiable,
    );
    expect(queued).toEqual([]);
  });

  it('hands the DNS lookup to a worker rather than blocking the request', async () => {
    // A slow resolver would otherwise hold the request open for its timeout.
    const { useCase, queued, evicted } = harness();

    const result = await useCase.execute(TENANT_ID, DOMAIN_ID);

    expect(result.status).toBe('checking');
    expect(queued).toEqual([{ tenantId: TENANT_ID, domainId: DOMAIN_ID }]);
    expect(evicted).toEqual(['dat.studiohub.vn']);
  });
});
