import { describe, expect, it } from 'vitest';
import { fakePort } from '~testing';
import type {
  CachedHost,
  HostLookup,
  ITenantCache,
} from '../../domain/ports/tenant-cache.port';
import type { ICurrentSubscriptionReader } from '../../domain/ports/current-subscription-reader.port';
import type {
  DomainRecord,
  ITenantDomainRepository,
} from '../../domain/ports/tenant-domain-repository.port';
import type { ITenantRepository, TenantRecord } from '../../domain/ports/tenant-repository.port';
import { UnknownTenantHost } from '../../domain/errors/tenancy-errors';
import type { SubscriptionSnapshot } from '../../domain/subscription-status';
import { ResolveTenantByHostUseCase } from './resolve-tenant-by-host.use-case';

const TENANT_ID = 'tenant-1';
const HOST = 'studiohub.vn';
const NOW = new Date('2026-08-19T00:00:00Z');

const tenant = (overrides: Partial<TenantRecord> = {}): TenantRecord =>
  ({
    id: TENANT_ID,
    name: 'StudioHub',
    slug: 'studiohub',
    status: 'active',
    vertical: 'studio',
    defaultTimezone: 'Asia/Ho_Chi_Minh',
    defaultLocale: 'vi',
    themeConfig: {},
    settings: {},
    defaultCancellationPolicyId: null,
    legalReadyAt: new Date('2026-01-01T00:00:00Z'),
    legalDocumentsReady: 4,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  }) as TenantRecord;

const domain = (overrides: Partial<DomainRecord> = {}): DomainRecord => ({
  id: 'domain-1',
  tenantId: TENANT_ID,
  hostname: HOST,
  isPrimary: true,
  kind: 'storefront',
  verificationToken: null,
  verifiedAt: new Date('2026-01-01T00:00:00Z'),
  ...overrides,
});

const subscription = (overrides: Partial<SubscriptionSnapshot> = {}): SubscriptionSnapshot => ({
  status: 'active',
  startsAt: new Date('2026-01-01T00:00:00Z'),
  expiresAt: new Date('2026-12-31T00:00:00Z'),
  ...overrides,
});

interface Options {
  record?: TenantRecord | null;
  found?: DomainRecord | null;
  cached?: CachedHost | null;
  sub?: SubscriptionSnapshot | null;
  adminHostname?: string | null;
}

function harness(options: Options = {}) {
  const evicted: string[] = [];
  const lookedUp: string[] = [];
  const primaryAskedFor: string[] = [];
  return {
    useCase: new ResolveTenantByHostUseCase(
      fakePort<ITenantRepository>({
        findById: () => Promise.resolve(options.record === undefined ? tenant() : options.record),
      }),
      fakePort<ITenantDomainRepository>({
        findByHostname: (hostname) => {
          lookedUp.push(hostname);
          return Promise.resolve(options.found === undefined ? domain() : options.found);
        },
        findPrimaryHostname: (_tenantId, kind) => {
          primaryAskedFor.push(kind);
          return Promise.resolve(
            options.adminHostname === undefined ? 'admin.studiohub.vn' : options.adminHostname,
          );
        },
      }),
      fakePort<ICurrentSubscriptionReader>({
        findByTenant: () =>
          Promise.resolve({
            current:
              options.sub === null
                ? null
                : ({ subscription: options.sub ?? subscription() } as never),
            evaluatedAt: NOW,
          }),
      }),
      fakePort<ITenantCache>({
        // A real read-through: when the test supplies `cached`, that is the hit;
        // otherwise the lookup runs, which is what proves the filter below.
        resolveHost: (hostname: string, lookup: HostLookup) =>
          options.cached !== undefined ? Promise.resolve(options.cached) : lookup(hostname),
        invalidateHost: (hostname) => {
          evicted.push(hostname);
          return Promise.resolve();
        },
      }),
    ),
    evicted,
    lookedUp,
    primaryAskedFor,
  };
}

describe('ResolveTenantByHostUseCase', () => {
  it('fails an unparseable Host CLOSED, without spending a lookup', async () => {
    const { useCase, lookedUp } = harness();

    await expect(useCase.execute('   ')).rejects.toBeInstanceOf(UnknownTenantHost);
    expect(lookedUp).toEqual([]);
  });

  it('normalises the host before resolving it', async () => {
    // A Host header carries the port and arbitrary case; the stored hostname
    // does not.
    const { useCase, lookedUp } = harness();

    await useCase.execute('StudioHub.VN:5173');

    expect(lookedUp).toEqual([HOST]);
  });

  it('refuses an UNVERIFIED custom domain', async () => {
    // Anyone can point a DNS record at us; only verification proves the domain
    // is theirs.
    const { useCase } = harness({ found: domain({ verifiedAt: null }) });

    await expect(useCase.execute(HOST)).rejects.toBeInstanceOf(UnknownTenantHost);
  });

  it('refuses a DASHBOARD hostname, which is not a storefront', async () => {
    // Ten modules resolve a tenant through this; without the kind filter an
    // admin host would read as a valid storefront everywhere.
    const { useCase } = harness({ cached: { tenantId: TENANT_ID, kind: 'dashboard' } });

    await expect(useCase.execute(HOST)).rejects.toBeInstanceOf(UnknownTenantHost);
  });

  it('EVICTS a cache entry pointing at a deleted tenant', async () => {
    // Otherwise the stale mapping keeps 404ing for the whole TTL even after the
    // host is re-pointed.
    const { useCase, evicted } = harness({ record: null });

    await expect(useCase.execute(HOST)).rejects.toBeInstanceOf(UnknownTenantHost);
    expect(evicted).toEqual([HOST]);
  });

  it('reports a healthy tenant as live', async () => {
    const { useCase } = harness();

    const result = await useCase.execute(HOST);

    expect(result).toMatchObject({
      id: TENANT_ID,
      slug: 'studiohub',
      live: true,
      adminHostname: 'admin.studiohub.vn',
    });
  });

  it('is NOT live when the tenant is suspended', async () => {
    const { useCase } = harness({ record: tenant({ status: 'suspended' }) });

    await expect(useCase.execute(HOST)).resolves.toMatchObject({ live: false });
  });

  it('is NOT live when the subscription has lapsed', async () => {
    // Evaluated fresh on every call, so an expiry takes effect immediately
    // rather than after the host cache TTL.
    const { useCase } = harness({
      sub: subscription({ expiresAt: new Date('2026-08-01T00:00:00Z') }),
    });

    await expect(useCase.execute(HOST)).resolves.toMatchObject({ live: false });
  });

  it('is NOT live when there is no subscription at all', async () => {
    const { useCase } = harness({ sub: null });

    await expect(useCase.execute(HOST)).resolves.toMatchObject({ live: false });
  });

  it('is NOT live until the legal documents are published', async () => {
    // The storefront hard gate: a tenant with no terms may not take bookings.
    const { useCase } = harness({ record: tenant({ legalReadyAt: null }) });

    await expect(useCase.execute(HOST)).resolves.toMatchObject({ live: false });
  });

  it('stays live for a past_due subscription whose paid-through date has not passed', async () => {
    // Dunning is not expiry — the storefront must not go dark on a failed
    // renewal attempt while the term is still paid for.
    const { useCase } = harness({ sub: subscription({ status: 'past_due' }) });

    await expect(useCase.execute(HOST)).resolves.toMatchObject({ live: true });
  });

  it("hands back the DASHBOARD hostname, not the storefront's own", async () => {
    // The storefront links to the console with it; returning the storefront
    // hostname would make that link point back at itself.
    const { useCase, primaryAskedFor } = harness();

    await useCase.execute(HOST);

    expect(primaryAskedFor).toEqual(['dashboard']);
  });

  it('answers a null admin hostname when the tenant has no dashboard domain', async () => {
    const { useCase } = harness({ adminHostname: null });

    await expect(useCase.execute(HOST)).resolves.toMatchObject({ adminHostname: null });
  });
});
