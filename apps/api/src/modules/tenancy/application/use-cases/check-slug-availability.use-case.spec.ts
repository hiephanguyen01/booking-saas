import { describe, expect, it } from 'vitest';
import { fakePort } from '~testing';
import type { TenancyConfig } from '../../domain/ports/tenancy-config.port';
import type {
  DomainRecord,
  ITenantDomainRepository,
} from '../../domain/ports/tenant-domain-repository.port';
import type { ITenantRepository, TenantRecord } from '../../domain/ports/tenant-repository.port';
import { CheckSlugAvailabilityUseCase } from './check-slug-availability.use-case';

const CONFIG = { baseDomain: 'bookingos.vn' } as TenancyConfig;
const TAKEN = { id: 'domain-1' } as DomainRecord;

interface Options {
  tenant?: TenantRecord | null;
  takenHosts?: string[];
}

function harness(options: Options = {}) {
  return new CheckSlugAvailabilityUseCase(
    fakePort<ITenantRepository>({ findBySlug: () => Promise.resolve(options.tenant ?? null) }),
    fakePort<ITenantDomainRepository>({
      findByHostname: (hostname) =>
        Promise.resolve((options.takenHosts ?? []).includes(hostname) ? TAKEN : null),
    }),
    CONFIG,
  );
}

describe('CheckSlugAvailabilityUseCase', () => {
  it('reports the storefront subdomain the slug would provision', async () => {
    const useCase = harness();

    await expect(useCase.execute('studiohub')).resolves.toEqual({
      slug: 'studiohub',
      subdomain: 'studiohub.bookingos.vn',
      baseDomain: 'bookingos.vn',
      available: true,
      reason: null,
    });
  });

  it('reports a slug another tenant holds', async () => {
    const useCase = harness({ tenant: { id: 'tenant-2' } as TenantRecord });

    await expect(useCase.execute('studiohub')).resolves.toMatchObject({
      available: false,
      reason: 'slug_taken',
    });
  });

  it('RESERVES a slug of literally "admin"', async () => {
    // `admin.bookingos.vn` would be a storefront host byte-identical to the
    // platform's own console host, and Caddy routes on the Host alone.
    const useCase = harness();

    await expect(useCase.execute('admin')).resolves.toMatchObject({
      available: false,
      reason: 'admin_prefix_reserved',
    });
  });

  it('reports the storefront subdomain being taken by a CUSTOM domain', async () => {
    // No tenant holds the slug, yet the hostname is spoken for — which is why
    // the domain checks are separate from the slug check.
    const useCase = harness({ takenHosts: ['studiohub.bookingos.vn'] });

    await expect(useCase.execute('studiohub')).resolves.toMatchObject({
      available: false,
      reason: 'domain_taken',
    });
  });

  it('reports the CONSOLE subdomain being taken, which create also provisions', async () => {
    // Create provisions both hosts, so an available storefront host alone is
    // not enough to promise the create will succeed.
    const useCase = harness({ takenHosts: ['admin.studiohub.bookingos.vn'] });

    await expect(useCase.execute('studiohub')).resolves.toMatchObject({
      available: false,
      reason: 'admin_domain_taken',
    });
  });

  it('reports slug_taken FIRST when several checks would fail', async () => {
    // The precedence has to match create's, or the form explains a different
    // problem than the one the create will hit.
    const useCase = harness({
      tenant: { id: 'tenant-2' } as TenantRecord,
      takenHosts: ['studiohub.bookingos.vn', 'admin.studiohub.bookingos.vn'],
    });

    await expect(useCase.execute('studiohub')).resolves.toMatchObject({ reason: 'slug_taken' });
  });
});
