import { describe, expect, it } from 'vitest';
import type { CreateTenantInput } from '@booking/contracts';
import { fakePort, fakeTx } from '~testing';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import {
  AdminPrefixReserved,
  DomainTaken,
  TenantSlugTaken,
} from '../../domain/errors/tenancy-errors';
import type { ITenantCache } from '../../domain/ports/tenant-cache.port';
import type { TenancyConfig } from '../../domain/ports/tenancy-config.port';
import type {
  CreateDomainData,
  DomainRecord,
  ITenantDomainRepository,
} from '../../domain/ports/tenant-domain-repository.port';
import type { ITenantRepository, TenantRecord } from '../../domain/ports/tenant-repository.port';
import { CreateTenantUseCase } from './create-tenant.use-case';

const TENANT_ID = 'tenant-new';

interface Options {
  slugTaken?: boolean;
  takenHosts?: string[];
  baseDomain?: string;
}

function harness(options: Options = {}) {
  const createdDomains: Array<{ data: CreateDomainData; tx: unknown }> = [];
  const createdTenants: Array<{ data: Record<string, unknown>; tx: unknown }> = [];
  const events: Array<{ eventType: string; payload: Record<string, unknown> }> = [];
  const evicted: string[] = [];
  const order: string[] = [];
  const tx = fakeTx({
    outboxEvent: {
      create: (args: { data: { eventType: string; payload: Record<string, unknown> } }) => {
        events.push({ eventType: args.data.eventType, payload: args.data.payload });
        return Promise.resolve({});
      },
    },
  });
  return {
    tx,
    useCase: new CreateTenantUseCase(
      fakePort<ITenantRepository>({
        findBySlug: () =>
          Promise.resolve(options.slugTaken ? ({ id: 'tenant-2' } as TenantRecord) : null),
        runInTransaction: <T,>(fn: (t: PrismaTx) => Promise<T>) => {
          order.push('openTransaction');
          return fn(tx).finally(() => order.push('closeTransaction'));
        },
        create: (data, t) => {
          createdTenants.push({ data: data as unknown as Record<string, unknown>, tx: t });
          return Promise.resolve({ id: TENANT_ID, ...data } as TenantRecord);
        },
      }),
      fakePort<ITenantDomainRepository>({
        findByHostname: (hostname) =>
          Promise.resolve(
            (options.takenHosts ?? []).includes(hostname)
              ? ({ id: 'domain-other' } as DomainRecord)
              : null,
          ),
        create: (data, t) => {
          createdDomains.push({ data, tx: t });
          return Promise.resolve({ id: `domain-${createdDomains.length}`, ...data } as DomainRecord);
        },
      }),
      fakePort<ITenantCache>({
        invalidateHost: (hostname) => {
          order.push(`evict:${hostname}`);
          evicted.push(hostname);
          return Promise.resolve();
        },
      }),
      { baseDomain: options.baseDomain ?? 'bookingos.vn' } as TenancyConfig,
      new OutboxService(),
    ),
    createdTenants,
    createdDomains,
    events,
    evicted,
    order,
  };
}

const input = (overrides: Partial<CreateTenantInput> = {}) =>
  ({
    name: 'StudioHub',
    slug: 'studiohub',
    vertical: 'studio',
    defaultTimezone: 'Asia/Ho_Chi_Minh',
    defaultLocale: 'vi',
    ...overrides,
  }) as CreateTenantInput;

describe('CreateTenantUseCase', () => {
  it('refuses a slug another tenant already holds', async () => {
    const { useCase, createdTenants } = harness({ slugTaken: true });

    await expect(useCase.execute(input())).rejects.toBeInstanceOf(TenantSlugTaken);
    expect(createdTenants).toEqual([]);
  });

  it('RESERVES a slug of literally "admin"', async () => {
    // It would mint a storefront host byte-identical to the platform's own
    // console host, and Caddy routes on the Host header alone.
    const { useCase, createdTenants } = harness();

    await expect(useCase.execute(input({ slug: 'admin' }))).rejects.toBeInstanceOf(
      AdminPrefixReserved,
    );
    expect(createdTenants).toEqual([]);
  });

  it('refuses when the storefront subdomain is already mapped', async () => {
    const { useCase, createdTenants } = harness({ takenHosts: ['studiohub.bookingos.vn'] });

    await expect(useCase.execute(input())).rejects.toBeInstanceOf(DomainTaken);
    expect(createdTenants).toEqual([]);
  });

  it('refuses when the CONSOLE subdomain is already mapped', async () => {
    // Both hosts are provisioned, so a free storefront host is not enough.
    const { useCase, createdTenants } = harness({
      takenHosts: ['admin.studiohub.bookingos.vn'],
    });

    await expect(useCase.execute(input())).rejects.toBeInstanceOf(DomainTaken);
    expect(createdTenants).toEqual([]);
  });

  it('provisions BOTH hosts, verified, in the same transaction as the tenant', async () => {
    // A failure provisioning the domain must not leave an orphaned tenant row,
    // and a tenant without a console host would have no way in at all.
    const { useCase, tx, createdTenants, createdDomains } = harness();

    await useCase.execute(input());

    expect(createdTenants[0]?.tx).toBe(tx);
    expect(createdDomains.map((d) => d.tx)).toEqual([tx, tx]);
    expect(createdDomains.map((d) => d.data)).toEqual([
      expect.objectContaining({
        tenantId: TENANT_ID,
        hostname: 'studiohub.bookingos.vn',
        kind: 'storefront',
        isPrimary: true,
        verificationToken: null,
      }),
      expect.objectContaining({
        tenantId: TENANT_ID,
        hostname: 'admin.studiohub.bookingos.vn',
        kind: 'dashboard',
        isPrimary: true,
        verificationToken: null,
      }),
    ]);
    for (const { data } of createdDomains) expect(data.verifiedAt).toBeInstanceOf(Date);
  });

  it('returns the STOREFRONT host as the primary domain', async () => {
    const { useCase } = harness();

    const result = await useCase.execute(input());

    expect(result.primaryDomain).toMatchObject({ hostname: 'studiohub.bookingos.vn' });
    expect(result.tenant).toMatchObject({ id: TENANT_ID, slug: 'studiohub' });
  });

  it('stores the submitted profile', async () => {
    const { useCase, createdTenants } = harness();

    await useCase.execute(input({ defaultLocale: 'en', defaultTimezone: 'Asia/Bangkok' }));

    expect(createdTenants[0]?.data).toEqual({
      name: 'StudioHub',
      slug: 'studiohub',
      vertical: 'studio',
      defaultTimezone: 'Asia/Bangkok',
      defaultLocale: 'en',
    });
  });

  it('announces the new tenant on its own transaction', async () => {
    const { useCase, events } = harness();

    await useCase.execute(input());

    expect(events).toEqual([
      { eventType: 'tenant.created', payload: { tenantId: TENANT_ID } },
    ]);
  });

  it('evicts both hosts AFTER the transaction commits', async () => {
    // They may be negatively cached from a probe; evicting inside would let a
    // concurrent request re-cache the miss before the rows exist.
    const { useCase, evicted, order } = harness();

    await useCase.execute(input());

    expect(evicted).toEqual(['studiohub.bookingos.vn', 'admin.studiohub.bookingos.vn']);
    expect(order.indexOf('closeTransaction')).toBeLessThan(
      order.indexOf('evict:studiohub.bookingos.vn'),
    );
  });

  it('builds the hosts from the CONFIGURED base domain', async () => {
    const { useCase, createdDomains } = harness({ baseDomain: 'stg.bookingos.vn' });

    await useCase.execute(input());

    expect(createdDomains.map((d) => d.data.hostname)).toEqual([
      'studiohub.stg.bookingos.vn',
      'admin.studiohub.stg.bookingos.vn',
    ]);
  });
});
