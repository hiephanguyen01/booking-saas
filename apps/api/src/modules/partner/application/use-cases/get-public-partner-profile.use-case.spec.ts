import { describe, expect, it } from 'vitest';
import { fakeCollaborator, fakePort, fakeTenantDb } from '~testing';
import type { ResolveTenantByHostUseCase } from '../../../tenancy/application/use-cases/resolve-tenant-by-host.use-case';
import { PublicPartnerNotFound } from '../../domain/errors/partner-errors';
import type {
  IPublicPartnerRepository,
  PublicPartnerRecord,
} from '../../domain/ports/public-partner-repository.port';
import { GetPublicPartnerProfileUseCase } from './get-public-partner-profile.use-case';

const profile = (overrides: Partial<PublicPartnerRecord> = {}): PublicPartnerRecord =>
  ({
    id: 'partner-1',
    name: 'Studio Giang',
    slug: 'studio-giang',
    description: 'Studio chụp ảnh tại quận 1.',
    logoUrl: 'https://cdn/logo.png',
    partnerType: 'individual',
    verifiedAt: new Date('2026-02-01T00:00:00Z'),
    createdAt: new Date('2026-01-01T00:00:00Z'),
    publishedOfferings: 12,
    completedBookings: 340,
    ratingAvg: 4.8,
    reviewCount: 96,
    listingTypes: ['studio'],
    ...overrides,
  }) as PublicPartnerRecord;

function harness(found: PublicPartnerRecord | null = profile()) {
  const tenantDb = fakeTenantDb();
  const hosts: string[] = [];
  const slugs: string[] = [];
  return {
    useCase: new GetPublicPartnerProfileUseCase(
      fakePort<IPublicPartnerRepository>({
        findProfile: (_tx, slug) => {
          slugs.push(slug);
          return Promise.resolve(found);
        },
      }),
      fakeCollaborator<ResolveTenantByHostUseCase>({
        execute: (host: unknown) => {
          hosts.push(host as string);
          return Promise.resolve({ id: 'tenant-9' });
        },
      }),
      tenantDb.service,
    ),
    tenantDb,
    hosts,
    slugs,
  };
}

describe('GetPublicPartnerProfileUseCase', () => {
  it('resolves the tenant from the HOST, then reads within it', async () => {
    // The storefront is unauthenticated; the Host header is the only tenant
    // signal there is.
    const { useCase, tenantDb, hosts, slugs } = harness();

    await useCase.execute('studiohub.vn', 'studio-giang');

    expect(hosts).toEqual(['studiohub.vn']);
    expect(tenantDb.openedFor).toEqual(['tenant-9']);
    expect(slugs).toEqual(['studio-giang']);
  });

  it('answers not-found for an unknown slug', async () => {
    const { useCase } = harness(null);

    await expect(useCase.execute('studiohub.vn', 'khong-co')).rejects.toBeInstanceOf(
      PublicPartnerNotFound,
    );
  });

  it('DROPS the whole bio when it carries a phone number', async () => {
    // Anti-disintermediation: a partial scrub leaks whatever the pattern
    // missed, so an empty bio is the safer failure.
    const { useCase } = harness(profile({ description: 'Liên hệ 0901234567 để đặt nhanh' }));

    const result = await useCase.execute('studiohub.vn', 'studio-giang');

    expect(result.description).toBeNull();
  });

  it('drops a bio carrying an email, a URL or a Zalo handle', async () => {
    for (const description of [
      'Email giang@studio.vn nhé',
      'Xem thêm tại https://giangstudio.vn',
      'Nhắn Zalo để được tư vấn',
    ]) {
      const { useCase } = harness(profile({ description }));

      await expect(useCase.execute('studiohub.vn', 'studio-giang')).resolves.toMatchObject({
        description: null,
      });
    }
  });

  it('keeps a clean bio', async () => {
    const { useCase } = harness();

    const result = await useCase.execute('studiohub.vn', 'studio-giang');

    expect(result.description).toBe('Studio chụp ảnh tại quận 1.');
  });

  it('exposes verification as a BOOLEAN, never the timestamp', async () => {
    // When someone was verified is nobody's business on a public page.
    const verified = harness();
    const notVerified = harness(profile({ verifiedAt: null }));

    await expect(verified.useCase.execute('h', 's')).resolves.toMatchObject({
      identityVerified: true,
    });
    await expect(notVerified.useCase.execute('h', 's')).resolves.toMatchObject({
      identityVerified: false,
    });
  });

  it('carries the public stats and the active-since date', async () => {
    const { useCase } = harness();

    const result = await useCase.execute('studiohub.vn', 'studio-giang');

    expect(result).toMatchObject({
      id: 'partner-1',
      slug: 'studio-giang',
      activeSince: '2026-01-01T00:00:00.000Z',
      stats: {
        publishedOfferings: 12,
        completedBookings: 340,
        ratingAvg: 4.8,
        reviewCount: 96,
      },
      listingTypes: ['studio'],
    });
  });
});
