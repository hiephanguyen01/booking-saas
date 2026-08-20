import { describe, expect, it } from 'vitest';
import { fakePort } from '~testing';
import { DomainNotFoundForTenant } from '../../domain/errors/tenancy-errors';
import type { IDnsVerifier } from '../../domain/ports/dns-verifier.port';
import type { TenancyConfig } from '../../domain/ports/tenancy-config.port';
import type {
  DomainRecord,
  ITenantDomainRepository,
} from '../../domain/ports/tenant-domain-repository.port';
import { CheckDomainDnsUseCase } from './check-domain-dns.use-case';

const TENANT_ID = 'tenant-1';
const DOMAIN_ID = 'domain-1';

const domain = (overrides: Partial<DomainRecord> = {}): DomainRecord =>
  ({
    id: DOMAIN_ID,
    tenantId: TENANT_ID,
    hostname: 'dat.studiohub.vn',
    isPrimary: false,
    kind: 'storefront',
    verificationToken: null,
    verifiedAt: null,
    ...overrides,
  }) as DomainRecord;

interface Options {
  found?: DomainRecord | null;
  cname?: string | null;
  ipv4?: string[];
  config?: Partial<TenancyConfig>;
}

function harness(options: Options = {}) {
  const resolved: string[] = [];
  return {
    useCase: new CheckDomainDnsUseCase(
      fakePort<ITenantDomainRepository>({
        findById: () => Promise.resolve(options.found === undefined ? domain() : options.found),
      }),
      fakePort<IDnsVerifier>({
        resolveCname: (hostname) => {
          resolved.push(hostname);
          return Promise.resolve(options.cname === undefined ? null : options.cname);
        },
        resolveIpv4: () => Promise.resolve(options.ipv4 ?? []),
      }),
      {
        baseDomain: 'bookingos.vn',
        storefrontCname: 'edge.bookingos.vn',
        storefrontIpv4: '203.0.113.10',
        ...options.config,
      } as TenancyConfig,
    ),
    resolved,
  };
}

describe('CheckDomainDnsUseCase', () => {
  it('answers not-found for an unknown domain', async () => {
    const { useCase } = harness({ found: null });

    await expect(useCase.execute(TENANT_ID, DOMAIN_ID)).rejects.toBeInstanceOf(
      DomainNotFoundForTenant,
    );
  });

  it("refuses ANOTHER tenant's domain", async () => {
    const { useCase } = harness({ found: domain({ tenantId: 'tenant-2' }) });

    await expect(useCase.execute(TENANT_ID, DOMAIN_ID)).rejects.toBeInstanceOf(
      DomainNotFoundForTenant,
    );
  });

  it('reports NOT pointing at us when DNS answers nothing', async () => {
    // TXT verification proves ownership; it does nothing to make the hostname
    // serve traffic. Without this the tenant sees "verified" and a blank page.
    const { useCase } = harness();

    await expect(useCase.execute(TENANT_ID, DOMAIN_ID)).resolves.toMatchObject({
      pointsToUs: false,
      observedCname: null,
      observedIpv4: [],
    });
  });

  it('accepts a matching CNAME', async () => {
    const { useCase } = harness({ cname: 'edge.bookingos.vn' });

    await expect(useCase.execute(TENANT_ID, DOMAIN_ID)).resolves.toMatchObject({
      pointsToUs: true,
    });
  });

  it('accepts a matching A record even when the CNAME does not match', async () => {
    // The A check is the stronger one — it follows the CNAME chain, so it
    // proves the record lands on us rather than merely being spelled right.
    const { useCase } = harness({ cname: 'somewhere.else', ipv4: ['203.0.113.10'] });

    await expect(useCase.execute(TENANT_ID, DOMAIN_ID)).resolves.toMatchObject({
      pointsToUs: true,
    });
  });

  it('normalises the CONFIGURED target — trailing dot and case', async () => {
    // A zone file writes the target as `Edge.BookingOS.vn.`; the resolver
    // reports it lowercase and dotless.
    const { useCase } = harness({
      cname: 'edge.bookingos.vn',
      config: { storefrontCname: ' Edge.BookingOS.vn. ' },
    });

    await expect(useCase.execute(TENANT_ID, DOMAIN_ID)).resolves.toMatchObject({
      pointsToUs: true,
    });
  });

  it('does NOT match when the platform has published no CNAME target', async () => {
    // An unset target normalises to the empty string; without the guard an
    // equally empty observation would read as a match.
    const { useCase } = harness({ cname: '', config: { storefrontCname: '' } });

    await expect(useCase.execute(TENANT_ID, DOMAIN_ID)).resolves.toMatchObject({
      pointsToUs: false,
    });
  });

  it('does NOT match when the platform has published no IPv4 target', async () => {
    const { useCase } = harness({ ipv4: [''], config: { storefrontIpv4: '' } });

    await expect(useCase.execute(TENANT_ID, DOMAIN_ID)).resolves.toMatchObject({
      pointsToUs: false,
    });
  });

  it('accepts our address among several A records', async () => {
    const { useCase } = harness({ ipv4: ['198.51.100.1', '203.0.113.10'] });

    await expect(useCase.execute(TENANT_ID, DOMAIN_ID)).resolves.toMatchObject({
      pointsToUs: true,
    });
  });

  it("resolves the DOMAIN's hostname and stamps when it checked", async () => {
    const { useCase, resolved } = harness({ found: domain({ hostname: 'shop.studiohub.vn' }) });
    const before = Date.now();

    const result = await useCase.execute(TENANT_ID, DOMAIN_ID);

    expect(resolved).toEqual(['shop.studiohub.vn']);
    expect(result.checkedAt.getTime()).toBeGreaterThanOrEqual(before);
  });
});
