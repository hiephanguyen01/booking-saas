import { describe, expect, it } from 'vitest';
import type { AddDomainInput } from '@booking/contracts';
import { fakeCollaborator, fakePort, fakeTenantDb } from '~testing';
import { TenantNotFound } from '../../../../shared/domain/errors/tenant-not-found';
import {
  AdminDomainPrefixRequired,
  AdminPrefixReserved,
  DomainNotVerified,
  DomainTaken,
} from '../../domain/errors/tenancy-errors';
import type {
  CreateDomainData,
  DomainRecord,
  ITenantDomainRepository,
} from '../../domain/ports/tenant-domain-repository.port';
import type { ITenantCache } from '../../domain/ports/tenant-cache.port';
import type { ITenantRepository, TenantRecord } from '../../domain/ports/tenant-repository.port';
import type { AssertCustomDomainAllowedUseCase } from './assert-custom-domain-allowed.use-case';
import { AddDomainUseCase } from './add-domain.use-case';

const TENANT_ID = 'tenant-1';

interface Options {
  tenant?: TenantRecord | null;
  taken?: DomainRecord | null;
  planError?: Error;
}

function harness(options: Options = {}) {
  const created: CreateDomainData[] = [];
  const createTxs: unknown[] = [];
  const evicted: string[] = [];
  const gateCalls: string[] = [];
  const tenantDb = fakeTenantDb();
  return {
    useCase: new AddDomainUseCase(
      fakePort<ITenantRepository>({
        findById: () =>
          Promise.resolve(
            options.tenant === undefined ? ({ id: TENANT_ID } as TenantRecord) : options.tenant,
          ),
      }),
      fakePort<ITenantDomainRepository>({
        findByHostname: () => Promise.resolve(options.taken ?? null),
        create: (data, tx) => {
          created.push(data);
          createTxs.push(tx);
          return Promise.resolve({ id: 'domain-new', ...data } as DomainRecord);
        },
      }),
      fakePort<ITenantCache>({
        invalidateHost: (hostname) => {
          evicted.push(hostname);
          return Promise.resolve();
        },
      }),
      fakeCollaborator<AssertCustomDomainAllowedUseCase>({
        execute: (tenantId: unknown) => {
          gateCalls.push(tenantId as string);
          return options.planError ? Promise.reject(options.planError) : Promise.resolve(undefined);
        },
      }),
      tenantDb.service,
    ),
    tenantDb,
    created,
    createTxs,
    evicted,
    gateCalls,
  };
}

const input = (overrides: Partial<AddDomainInput> = {}) =>
  ({ hostname: 'dat.studiohub.vn', kind: 'storefront', isPrimary: false, ...overrides }) as AddDomainInput;

describe('AddDomainUseCase', () => {
  it('answers not-found for a tenant that does not exist', async () => {
    const { useCase, created } = harness({ tenant: null });

    await expect(useCase.execute(TENANT_ID, input())).rejects.toBeInstanceOf(TenantNotFound);
    expect(created).toEqual([]);
  });

  it('REFUSES to create a domain already marked primary', async () => {
    // A new custom domain is born unverified, so it can never legitimately be
    // primary — and silently dropping the flag would leave the tenant believing
    // they had set it.
    const { useCase, created } = harness();

    await expect(useCase.execute(TENANT_ID, input({ isPrimary: true }))).rejects.toBeInstanceOf(
      DomainNotVerified,
    );
    expect(created).toEqual([]);
  });

  it('is gated on the plan allowing custom domains', async () => {
    const { useCase, created, gateCalls } = harness({ planError: new Error('plan says no') });

    await expect(useCase.execute(TENANT_ID, input())).rejects.toThrow('plan says no');
    expect(gateCalls).toEqual([TENANT_ID]);
    expect(created).toEqual([]);
  });

  it('requires the admin. prefix on a DASHBOARD hostname', async () => {
    // Caddy routes on the Host header alone, so the prefix is the whole routing
    // contract.
    const { useCase } = harness();

    await expect(
      useCase.execute(TENANT_ID, input({ kind: 'dashboard', hostname: 'console.studiohub.vn' })),
    ).rejects.toBeInstanceOf(AdminDomainPrefixRequired);
  });

  it('RESERVES the admin. prefix against a storefront hostname', async () => {
    // Without this a storefront could claim `admin.…` and Caddy would route
    // real shop traffic to the console.
    const { useCase } = harness();

    await expect(
      useCase.execute(TENANT_ID, input({ kind: 'storefront', hostname: 'admin.studiohub.vn' })),
    ).rejects.toBeInstanceOf(AdminPrefixReserved);
  });

  it('accepts a correctly prefixed dashboard hostname', async () => {
    const { useCase, created } = harness();

    await useCase.execute(TENANT_ID, input({ kind: 'dashboard', hostname: 'admin.studiohub.vn' }));

    expect(created[0]).toMatchObject({ kind: 'dashboard', hostname: 'admin.studiohub.vn' });
  });

  it('refuses a hostname another tenant already holds', async () => {
    const { useCase, created } = harness({ taken: { id: 'domain-other' } as DomainRecord });

    await expect(useCase.execute(TENANT_ID, input())).rejects.toBeInstanceOf(DomainTaken);
    expect(created).toEqual([]);
  });

  it('normalises the hostname before storing it', async () => {
    const { useCase, created } = harness();

    await useCase.execute(TENANT_ID, input({ hostname: 'DAT.StudioHub.VN:443' }));

    expect(created[0]?.hostname).toBe('dat.studiohub.vn');
  });

  it('creates it UNVERIFIED, with a TXT token the tenant must publish', async () => {
    // The insert runs on the tenant's own transaction, so RLS applies to it.
    const { useCase, created, createTxs, tenantDb } = harness();

    await useCase.execute(TENANT_ID, input());

    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(createTxs).toEqual([tenantDb.tx]);
    expect(created[0]).toMatchObject({
      tenantId: TENANT_ID,
      isPrimary: false,
      verifiedAt: null,
    });
    expect(created[0]?.verificationToken).toMatch(/^bookingos-verify=[0-9a-f]{32}$/);
  });

  it('mints a DIFFERENT token per domain', async () => {
    // A shared token would let one verified domain vouch for another.
    const { useCase, created } = harness();

    await useCase.execute(TENANT_ID, input({ hostname: 'a.studiohub.vn' }));
    await useCase.execute(TENANT_ID, input({ hostname: 'b.studiohub.vn' }));

    expect(created[0]?.verificationToken).not.toBe(created[1]?.verificationToken);
  });

  it('evicts the host cache, which may hold a negative entry for this hostname', async () => {
    // Unknown hosts are negatively cached; without the eviction the new domain
    // stays 404 for the whole TTL.
    const { useCase, evicted } = harness();

    await useCase.execute(TENANT_ID, input({ hostname: 'DAT.studiohub.vn' }));

    expect(evicted).toEqual(['dat.studiohub.vn']);
  });
});
