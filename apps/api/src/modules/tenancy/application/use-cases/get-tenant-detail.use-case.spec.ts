import { describe, expect, it } from 'vitest';
import { fakePort } from '~testing';
import { TenantNotFound } from '../../../../shared/domain/errors/tenant-not-found';
import type { ICurrentSubscriptionReader } from '../../domain/ports/current-subscription-reader.port';
import type {
  DomainRecord,
  ITenantDomainRepository,
} from '../../domain/ports/tenant-domain-repository.port';
import type { ITenantRepository, TenantRecord } from '../../domain/ports/tenant-repository.port';
import { GetTenantDetailUseCase } from './get-tenant-detail.use-case';

const TENANT_ID = 'tenant-1';
const NOW = new Date('2026-08-19T00:00:00Z');
const TENANT = { id: TENANT_ID, name: 'StudioHub' } as TenantRecord;

const domain = (overrides: Partial<DomainRecord>): DomainRecord =>
  ({
    id: 'domain-1',
    tenantId: TENANT_ID,
    hostname: 'studiohub.vn',
    isPrimary: false,
    kind: 'storefront',
    verificationToken: null,
    verifiedAt: null,
    ...overrides,
  }) as DomainRecord;

interface Options {
  found?: TenantRecord | null;
  domains?: DomainRecord[];
  hasSubscription?: boolean;
}

function harness(options: Options = {}) {
  const windows: Array<{ from: Date; to: Date }> = [];
  return {
    useCase: new GetTenantDetailUseCase(
      fakePort<ITenantRepository>({
        findById: () => Promise.resolve(options.found === undefined ? TENANT : options.found),
        countPartners: () => Promise.resolve(7),
        countListings: () => Promise.resolve(42),
        countBookingsBetween: (_tenantId, from, to) => {
          windows.push({ from, to });
          return Promise.resolve(13);
        },
      }),
      fakePort<ITenantDomainRepository>({
        listByTenant: () =>
          Promise.resolve(
            options.domains ?? [domain({ isPrimary: true, kind: 'storefront' })],
          ),
      }),
      fakePort<ICurrentSubscriptionReader>({
        findByTenant: () =>
          Promise.resolve({
            current:
              options.hasSubscription === false
                ? null
                : ({
                    subscription: {
                      status: 'active',
                      expiresAt: new Date('2026-12-31T00:00:00Z'),
                    },
                    plan: { name: 'Chuyên nghiệp' },
                  } as never),
            evaluatedAt: NOW,
          }),
      }),
    ),
    windows,
  };
}

describe('GetTenantDetailUseCase', () => {
  it('answers not-found for an unknown tenant', async () => {
    const { useCase } = harness({ found: null });

    await expect(useCase.execute(TENANT_ID, NOW)).rejects.toBeInstanceOf(TenantNotFound);
  });

  it('composes the profile, subscription and the three counts into one read', async () => {
    const { useCase } = harness();

    const result = await useCase.execute(TENANT_ID, NOW);

    expect(result).toMatchObject({
      tenant: TENANT,
      subscription: {
        planName: 'Chuyên nghiệp',
        status: 'active',
        expiresAt: new Date('2026-12-31T00:00:00Z'),
      },
      counts: { partners: 7, listings: 42, bookings30d: 13 },
    });
  });

  it('answers a null subscription for a tenant that never subscribed', async () => {
    const { useCase } = harness({ hasSubscription: false });

    const result = await useCase.execute(TENANT_ID, NOW);

    expect(result.subscription).toBeNull();
  });

  it('counts bookings over a TRAILING 30 days ending now', async () => {
    const { useCase, windows } = harness();

    await useCase.execute(TENANT_ID, NOW);

    expect(windows).toEqual([
      { from: new Date('2026-07-20T00:00:00Z'), to: NOW },
    ]);
  });

  it('picks the primary STOREFRONT host, ignoring the console one', async () => {
    // Both are primary within their own kind; taking the first primary would
    // show the admin hostname as the tenant's public address.
    const { useCase } = harness({
      domains: [
        domain({ id: 'd-admin', hostname: 'admin.studiohub.vn', kind: 'dashboard', isPrimary: true }),
        domain({ id: 'd-shop', hostname: 'studiohub.vn', kind: 'storefront', isPrimary: true }),
      ],
    });

    const result = await useCase.execute(TENANT_ID, NOW);

    expect(result.primaryDomain).toMatchObject({ id: 'd-shop' });
  });

  it('ignores a NON-primary storefront host', async () => {
    const { useCase } = harness({
      domains: [domain({ isPrimary: false, kind: 'storefront' })],
    });

    const result = await useCase.execute(TENANT_ID, NOW);

    expect(result.primaryDomain).toBeNull();
  });

  it('answers a null primary domain when the tenant has none', async () => {
    const { useCase } = harness({ domains: [] });

    await expect(useCase.execute(TENANT_ID, NOW)).resolves.toMatchObject({ primaryDomain: null });
  });
});
