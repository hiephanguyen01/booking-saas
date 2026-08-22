import { describe, expect, it } from 'vitest';
import { fakeCollaborator, fakePort } from '~testing';
import { TenantNotFound } from '../../../../shared/domain/errors/tenant-not-found';
import type { IPermissionResolver } from '../../../identity-access/domain/ports/permission-resolver.port';
import type { ITenantRepository, TenantRecord } from '../../../tenancy/domain/ports/tenant-repository.port';
import type { ResolveTenantByHostUseCase } from '../../../tenancy/application/use-cases/resolve-tenant-by-host.use-case';
import { MissingTenantHost } from '../../../../shared/http/request-boundary-errors';
import {
  ResolveLegalCallerScopeUseCase,
  type LegalCallerScopeInput,
} from './resolve-legal-caller-scope.use-case';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const PARTNER_ID = '22222222-2222-4222-8222-222222222222';
const OTHER_TENANT = '33333333-3333-4333-8333-333333333333';

interface Options {
  /** Permission sets keyed by `tenantId|partnerId`. */
  held?: Record<string, string[]>;
  tenant?: TenantRecord | null;
  hostTenantId?: string;
}

function harness(options: Options = {}) {
  const scopes: unknown[] = [];
  const hosts: string[] = [];
  return {
    useCase: new ResolveLegalCallerScopeUseCase(
      fakePort<IPermissionResolver>({
        resolve: (_userId, scope) => {
          scopes.push(scope);
          const key = `${scope.tenantId ?? ''}|${scope.partnerId ?? ''}`;
          return Promise.resolve(new Set(options.held?.[key] ?? []));
        },
      }),
      fakePort<ITenantRepository>({
        findById: () =>
          Promise.resolve(
            options.tenant === undefined ? ({ id: OTHER_TENANT } as TenantRecord) : options.tenant,
          ),
      }),
      fakeCollaborator<ResolveTenantByHostUseCase>({
        execute: (host: unknown) => {
          hosts.push(host as string);
          return Promise.resolve({ id: options.hostTenantId ?? 'tenant-from-host' });
        },
      }),
    ),
    scopes,
    hosts,
  };
}

const input = (overrides: Partial<LegalCallerScopeInput> = {}) =>
  ({ userId: 'user-1', host: 'studiohub.vn', ...overrides }) as LegalCallerScopeInput;

describe('ResolveLegalCallerScopeUseCase', () => {
  it('resolves a PARTNER scope when the caller holds partner permissions', async () => {
    const { useCase } = harness({
      held: { [`${TENANT_ID}|${PARTNER_ID}`]: ['partner.listing.manage'] },
    });

    await expect(
      useCase.execute(input({ tenantIdHeader: TENANT_ID, partnerIdHeader: PARTNER_ID })),
    ).resolves.toEqual({ tenantId: TENANT_ID, partnerId: PARTNER_ID, scopes: ['partner'] });
  });

  it('GATES a tenant-scope caller on NOTHING — they are the counterparty', async () => {
    // The tenant owner is who the partner and affiliate terms are with; asking
    // them to sign their own terms would be circular.
    const { useCase } = harness({ held: { [`${TENANT_ID}|`]: ['tenant.members.manage'] } });

    await expect(
      useCase.execute(input({ tenantIdHeader: TENANT_ID })),
    ).resolves.toEqual({ tenantId: TENANT_ID, partnerId: null, scopes: [] });
  });

  it('falls back from a CLAIMED partner scope the caller does not hold', async () => {
    // The header is client-supplied; holding nothing in that partner means they
    // are not acting as it.
    const { useCase } = harness({ held: { [`${TENANT_ID}|`]: ['tenant.members.manage'] } });

    const result = await useCase.execute(
      input({ tenantIdHeader: TENANT_ID, partnerIdHeader: PARTNER_ID }),
    );

    expect(result).toMatchObject({ partnerId: null, scopes: [] });
  });

  it('resolves an AFFILIATE scope from its own header', async () => {
    const { useCase } = harness();

    await expect(
      useCase.execute(input({ affiliateTenantHeader: OTHER_TENANT })),
    ).resolves.toEqual({ tenantId: OTHER_TENANT, partnerId: null, scopes: ['affiliate'] });
  });

  it('answers not-found for an affiliate header naming no tenant', async () => {
    const { useCase } = harness({ tenant: null });

    await expect(
      useCase.execute(input({ affiliateTenantHeader: OTHER_TENANT })),
    ).rejects.toBeInstanceOf(TenantNotFound);
  });

  it('treats a MALFORMED header as absent rather than querying with it', async () => {
    // Prisma would throw on a non-uuid, which would turn a bad header into a
    // 500 instead of a storefront visitor.
    const { useCase, scopes, hosts } = harness();

    const result = await useCase.execute(
      input({ tenantIdHeader: 'not-a-uuid', partnerIdHeader: '   ' }),
    );

    expect(scopes).toEqual([]);
    expect(hosts).toEqual(['studiohub.vn']);
    expect(result).toMatchObject({ scopes: [] });
  });

  it('gates a storefront CUSTOMER on nothing', async () => {
    // Customers are never blocked; they are told at their next checkout.
    const { useCase } = harness({ hostTenantId: 'tenant-9' });

    await expect(useCase.execute(input())).resolves.toEqual({
      tenantId: 'tenant-9',
      partnerId: null,
      scopes: [],
    });
  });

  it('prefers the FORWARDED host, taking only its first entry', async () => {
    // Behind a proxy the visitor's own host is the forwarded one, and the
    // header can carry a chain.
    const { useCase, hosts } = harness();

    await useCase.execute(
      input({ forwardedHost: ' studiohub.vn , proxy.internal ', host: 'api.internal' }),
    );

    expect(hosts).toEqual(['studiohub.vn']);
  });

  it('refuses when there is no host to resolve from at all', async () => {
    const { useCase } = harness();

    await expect(
      useCase.execute({ userId: 'user-1' } as LegalCallerScopeInput),
    ).rejects.toBeInstanceOf(MissingTenantHost);
  });
});
