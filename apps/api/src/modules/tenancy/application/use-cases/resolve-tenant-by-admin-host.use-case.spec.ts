import { describe, expect, it } from 'vitest';
import { fakePort } from '~testing';
import type { CachedHost, HostLookup, ITenantCache } from '../../domain/ports/tenant-cache.port';
import type { ICurrentSubscriptionReader } from '../../domain/ports/current-subscription-reader.port';
import type {
  DomainRecord,
  ITenantDomainRepository,
} from '../../domain/ports/tenant-domain-repository.port';
import type { ITenantRepository, TenantRecord } from '../../domain/ports/tenant-repository.port';
import { UnknownTenantHost } from '../../domain/errors/tenancy-errors';
import type { SubscriptionSnapshot } from '../../domain/subscription-status';
import { ResolveTenantByAdminHostUseCase } from './resolve-tenant-by-admin-host.use-case';

const TENANT_ID = 'tenant-1';
const HOST = 'admin.studiohub.vn';
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
    legalReadyAt: null,
    legalDocumentsReady: 0,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  }) as TenantRecord;

const domain = (overrides: Partial<DomainRecord> = {}): DomainRecord => ({
  id: 'domain-1',
  tenantId: TENANT_ID,
  hostname: HOST,
  isPrimary: true,
  kind: 'dashboard',
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
}

function harness(options: Options = {}) {
  const evicted: string[] = [];
  const lookedUp: string[] = [];
  return {
    useCase: new ResolveTenantByAdminHostUseCase(
      fakePort<ITenantRepository>({
        findById: () => Promise.resolve(options.record === undefined ? tenant() : options.record),
      }),
      fakePort<ITenantDomainRepository>({
        findByHostname: (hostname) => {
          lookedUp.push(hostname);
          return Promise.resolve(options.found === undefined ? domain() : options.found);
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
  };
}

describe('ResolveTenantByAdminHostUseCase', () => {
  it('fails an unparseable Host closed, without a lookup', async () => {
    const { useCase, lookedUp } = harness();

    await expect(useCase.execute('   ')).rejects.toBeInstanceOf(UnknownTenantHost);
    expect(lookedUp).toEqual([]);
  });

  it('refuses a STOREFRONT hostname on the console', async () => {
    const { useCase } = harness({ cached: { tenantId: TENANT_ID, kind: 'storefront' } });

    await expect(useCase.execute(HOST)).rejects.toBeInstanceOf(UnknownTenantHost);
  });

  it('refuses an unverified domain', async () => {
    const { useCase } = harness({ found: domain({ verifiedAt: null }) });

    await expect(useCase.execute(HOST)).rejects.toBeInstanceOf(UnknownTenantHost);
  });

  it('evicts a cache entry pointing at a deleted tenant', async () => {
    const { useCase, evicted } = harness({ record: null });

    await expect(useCase.execute(HOST)).rejects.toBeInstanceOf(UnknownTenantHost);
    expect(evicted).toEqual([HOST]);
  });

  it('LETS AN EXPIRED TENANT IN — the console is where they renew', async () => {
    // Locking them out is the one failure mode that cannot be recovered from
    // in-product. Note `expired`, not `suspended`.
    const { useCase } = harness({
      record: tenant({ status: 'expired' }),
      sub: subscription({ expiresAt: new Date('2026-08-01T00:00:00Z') }),
    });

    const result = await useCase.execute(HOST);

    expect(result).toMatchObject({ suspended: false, subscriptionExpired: true });
  });

  it('does not apply the storefront legal gate to the console', async () => {
    // The tenant has published nothing yet — the console is exactly where they
    // go to do that.
    const { useCase } = harness({ record: tenant({ legalReadyAt: null }) });

    await expect(useCase.execute(HOST)).resolves.toMatchObject({ suspended: false });
  });

  it('REPORTS a suspension rather than 404ing it', async () => {
    // The operator typed a hostname they know exists; "not found" would make a
    // deliberate suspension look like a broken domain.
    const { useCase } = harness({ record: tenant({ status: 'suspended' }) });

    const result = await useCase.execute(HOST);

    expect(result.suspended).toBe(true);
  });

  it('flags a lapsed subscription for the renewal banner', async () => {
    const { useCase } = harness({
      sub: subscription({ expiresAt: new Date('2026-08-01T00:00:00Z') }),
    });

    await expect(useCase.execute(HOST)).resolves.toMatchObject({ subscriptionExpired: true });
  });

  it('does not flag a healthy subscription', async () => {
    const { useCase } = harness();

    await expect(useCase.execute(HOST)).resolves.toMatchObject({ subscriptionExpired: false });
  });

  it('parses the branding out of the theme config', async () => {
    const { useCase } = harness({
      record: tenant({ themeConfig: { logoUrl: 'https://cdn/logo.png' } }),
    });

    const result = await useCase.execute(HOST);

    expect(result.branding).toMatchObject({ logoUrl: 'https://cdn/logo.png' });
  });

  it('answers null branding rather than failing on an unparseable theme config', async () => {
    // A malformed theme must not take the whole console down.
    const { useCase } = harness({ record: tenant({ themeConfig: { logoUrl: 42 } }) });

    await expect(useCase.execute(HOST)).resolves.toMatchObject({ branding: null });
  });
});
