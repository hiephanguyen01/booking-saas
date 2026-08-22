import { describe, expect, it } from 'vitest';
import { fakePort } from '~testing';
import type { HostLookup, ITenantCache } from '../../domain/ports/tenant-cache.port';
import type {
  DomainRecord,
  ITenantDomainRepository,
} from '../../domain/ports/tenant-domain-repository.port';
import { CheckDomainTlsAllowedUseCase } from './check-domain-tls-allowed.use-case';

const domain = (overrides: Partial<DomainRecord> = {}): DomainRecord => ({
  id: 'domain-1',
  tenantId: 'tenant-1',
  hostname: 'studiohub.vn',
  isPrimary: true,
  kind: 'storefront',
  verificationToken: null,
  verifiedAt: new Date('2026-01-01T00:00:00Z'),
  ...overrides,
});

function harness(found: DomainRecord | null = domain()) {
  const lookedUp: string[] = [];
  return {
    useCase: new CheckDomainTlsAllowedUseCase(
      fakePort<ITenantDomainRepository>({
        findByHostname: (hostname) => {
          lookedUp.push(hostname);
          return Promise.resolve(found);
        },
      }),
      fakePort<ITenantCache>({
        resolveHost: (hostname: string, lookup: HostLookup) => lookup(hostname),
      }),
    ),
    lookedUp,
  };
}

describe('CheckDomainTlsAllowedUseCase', () => {
  it('REFUSES a hostname nobody has registered', async () => {
    // This runs during the TLS handshake: a yes makes us go and obtain a
    // certificate, so it is the only thing between a stranger pointing any
    // domain at our IP and us issuing on their behalf — and hitting the ACME
    // rate limit doing it.
    const { useCase } = harness(null);

    await expect(useCase.execute('stranger.example')).resolves.toBe(false);
  });

  it('REFUSES an unverified domain', async () => {
    const { useCase } = harness(domain({ verifiedAt: null }));

    await expect(useCase.execute('studiohub.vn')).resolves.toBe(false);
  });

  it('fails an unparseable Host closed, without a lookup', async () => {
    const { useCase, lookedUp } = harness();

    await expect(useCase.execute('   ')).resolves.toBe(false);
    expect(lookedUp).toEqual([]);
  });

  it('allows a verified STOREFRONT host', async () => {
    const { useCase } = harness();

    await expect(useCase.execute('studiohub.vn')).resolves.toBe(true);
  });

  it('allows a verified DASHBOARD host too — it needs a certificate as much', async () => {
    // Kind-agnostic on purpose, unlike the storefront resolver.
    const { useCase } = harness(domain({ kind: 'dashboard' }));

    await expect(useCase.execute('admin.studiohub.vn')).resolves.toBe(true);
  });

  it('normalises the Host before looking it up', async () => {
    const { useCase, lookedUp } = harness();

    await useCase.execute('StudioHub.VN:443');

    expect(lookedUp).toEqual(['studiohub.vn']);
  });
});
