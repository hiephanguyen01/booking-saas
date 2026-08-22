import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb } from '~testing';
import { TenantNotFound } from '../../../../shared/domain/errors/tenant-not-found';
import type { ITenantRepository, TenantRecord } from '../../../tenancy/domain/ports/tenant-repository.port';
import type {
  DocumentRow,
  ILegalDocumentRepository,
} from '../../domain/ports/legal-document-repository.port';
import { GetTenantLegalUseCase } from './get-tenant-legal.use-case';

const TENANT_ID = 'tenant-1';

const document = (docType: string, locales: string[], overrides: Record<string, unknown> = {}): DocumentRow =>
  ({
    id: `doc-${docType}`,
    docType,
    currentVersionId: 'version-1',
    versions: [
      {
        id: 'version-1',
        versionNo: 1,
        isMaterialChange: true,
        publishedAt: new Date('2026-01-01T00:00:00Z'),
        translations: locales.map((locale) => ({ locale, title: 't', bodyMd: 'b' })),
      },
    ],
    ...overrides,
  }) as unknown as DocumentRow;

function harness(rows: DocumentRow[], tenant: TenantRecord | null = { id: TENANT_ID, defaultLocale: 'vi' } as TenantRecord) {
  const tenantDb = fakeTenantDb();
  return {
    useCase: new GetTenantLegalUseCase(
      fakePort<ILegalDocumentRepository>({ listAll: () => Promise.resolve(rows) }),
      fakePort<ITenantRepository>({ findById: () => Promise.resolve(tenant) }),
      tenantDb.service,
    ),
    tenantDb,
  };
}

const ALL_FOUR = ['customer_terms', 'privacy_policy', 'partner_terms', 'affiliate_terms'];

describe('GetTenantLegalUseCase', () => {
  it('answers not-found for an unknown tenant', async () => {
    const { useCase } = harness([], null);

    await expect(useCase.execute(TENANT_ID)).rejects.toBeInstanceOf(TenantNotFound);
  });

  it('reports READY only when all four are published in the default locale', async () => {
    const { useCase, tenantDb } = harness(ALL_FOUR.map((t) => document(t, ['vi'])));

    const result = await useCase.execute(TENANT_ID);

    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(result).toMatchObject({ defaultLocale: 'vi', legalReady: true, publishedCount: 4 });
  });

  it('does not count a document published only in ANOTHER locale', async () => {
    // The storefront gate keys on the tenant's own default locale.
    const { useCase } = harness([
      ...ALL_FOUR.slice(0, 3).map((t) => document(t, ['vi'])),
      document('affiliate_terms', ['en']),
    ]);

    const result = await useCase.execute(TENANT_ID);

    expect(result).toMatchObject({ legalReady: false, publishedCount: 3 });
  });

  it('counts the CURRENT version, not a draft awaiting review', async () => {
    const { useCase } = harness([
      ...ALL_FOUR.slice(0, 3).map((t) => document(t, ['vi'])),
      document('affiliate_terms', ['vi'], { currentVersionId: null }),
    ]);

    const result = await useCase.execute(TENANT_ID);

    expect(result).toMatchObject({ legalReady: false, publishedCount: 3 });
  });

  it('lists ALL FOUR required documents even when none exists yet', async () => {
    // The console needs a row per document to offer "draft this one".
    const { useCase } = harness([]);

    const result = await useCase.execute(TENANT_ID);

    expect(result.documents.map((d) => d.docType).sort()).toEqual([...ALL_FOUR].sort());
    expect(result).toMatchObject({ legalReady: false, publishedCount: 0 });
  });
});
